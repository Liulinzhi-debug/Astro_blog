---
title: "CUDA SGEMM 矩阵乘法优化笔记"
description: "基于 A100 设备的 CUDA 矩阵乘法逐步优化记录"
pubDate: 2026-03-23
heroImage: 'https://github.com/Liulinzhi-debug/picx-images-hosting/raw/master/benchmark_results.41ymhd40w1.webp'
---

> **参考原文：** [CUDA SGEMM Optimization](https://siboehm.com/articles/22/CUDA-MMM)
> **测试硬件：** NVIDIA A100

## 1. 性能汇总
这是测试三次取的最高FLOPS
图中的FLOPS是脚本自动采集的一次数据
| 内核版本 | 核心优化策略 | 性能 (GFLOPS) | 解决的主要瓶颈 |
| :--- | :--- | :--- | :--- |
| **cuBLAS** | 官方库基准 | 16463.7 | 硬件理论上限参考 |
| **Kernel 1** | 朴素实现 | 162.3 |  |
| **Kernel 2** | 内存合并 (Coalescing) | 1647.6 | 修复全局内存的非合并读取 |
| **Kernel 3** | 共享内存 (SMEM) | 3013.2 | 减少全局内存重复访问 |
| **Kernel 4** | 1D 寄存器复用 | 6017.4 | 缓解 SMEM 访存指令拥塞 |
| **Kernel 5** | 2D 寄存器复用 | 8448.8 | 极大提升算术强度与数据复用 |
| **Kernel 6** | 向量化访存 + 转置 | 9350.5 | 降低指令发射压力，消除跳跃读取 |
| **Kernel 9** | 参数自动调优 (Autotune)| 11536.9 | 匹配 A100 最佳 Occupancy |
| **Kernel 10**| 线程束分块 (Warptiling)| 13042.0 | 对齐 GPU 硬件调度逻辑 |


---

## 2. 优化逻辑

### GMEM优化

**Kernel 1 (Naive)**
* 单线程计算结果矩阵 $C$ 的单个元素。
*  **非合并访存**。相邻线程访问矩阵 $A$ 时地址跳跃跨度大，带宽利用率极低。
```cpp
void run_sgemm_naive(int M, int N, int K, float alpha, float *A, float *B,
                     float beta, float *C) {
  dim3 gridDim(CEIL_DIV(M, 32), CEIL_DIV(N, 32));
  dim3 blockDim(32, 32);
  sgemm_naive<<<gridDim, blockDim>>>(M, N, K, alpha, A, B, beta, C);
}
```
- cuh中对应
```cpp
__global__ void sgemm_naive(int M, int N, int K, float alpha, const float *A,
                            const float *B, float beta, float *C) {
    ···                            
    const uint x = blockIdx.x * blockDim.x + threadIdx.x;
    const uint y = blockIdx.y * blockDim.y + threadIdx.y;
    ···
}
```


**Kernel 2 (Coalescing)**
* 重映射线程索引，让相邻线程 (`threadIdx.x`) 负责连续的列计算 (`y`)。
* 触发硬件**合并访存**（单次事务获取 32 个数据），性能提升 10 倍。
```cpp
void run_sgemm_coalesce(int M, int N, int K, float alpha, float *A, float *B,
                        float beta, float *C) {
  dim3 gridDim(CEIL_DIV(M, 32), CEIL_DIV(N, 32));
  dim3 blockDim(32 * 32);
  sgemm_global_mem_coalesce<32>
      <<<gridDim, blockDim>>>(M, N, K, alpha, A, B, beta, C);
}
```

```cpp
__global__ void sgemm_naive(int M, int N, int K, float alpha, const float *A,
                            const float *B, float beta, float *C) {
    ···                            
    const int x = blockIdx.x * BLOCKSIZE + (threadIdx.x / BLOCKSIZE);
    const int y = blockIdx.y * BLOCKSIZE + (threadIdx.x % BLOCKSIZE);
    ···
}

#  本质上这也等价于二维 blockDim(32, 32);情况下的
#  const uint x = blockIdx.x * blockDim.x + threadIdx.y; 
#  const uint y = blockIdx.y * blockDim.y + threadIdx.x; // threadIdx.x 耦合了列
```
### SMEM优化

**Kernel 3 (Shared Memory Caching)**
*  Kernel 2 虽合并了访存，但每个元素都被重复从 GMEM 读取，带宽耗尽。
```cpp
As[threadRow * BLOCKSIZE + threadCol] = A[threadRow * K + threadCol];
Bs[threadRow * BLOCKSIZE + threadCol] = B[threadRow * N + threadCol];
```
*  引入片上共享内存 (SMEM)。线程块 (Block) 协同将 $A$、$B$ 划分为 Tile 搬入 SMEM 后反复使用。
```cpp
// 声明共享内存
__shared__ float As[BLOCKSIZE * BLOCKSIZE];
__shared__ float Bs[BLOCKSIZE * BLOCKSIZE];
// ... [搬运代码] ...
// 同步
__syncthreads(); 
// 反复使用 SMEM 中的 Tile 数据进行计算
for (int dotIdx = 0; dotIdx < BLOCKSIZE; ++dotIdx) {
  tmp += As[threadRow * BLOCKSIZE + dotIdx] *Bs[dotIdx * BLOCKSIZE + threadCol];
}
```
*  **MIO Throttle**。访存指令过多导致指令队列拥塞，计算单元等待数据。
```cpp
tmp += As[threadRow * BLOCKSIZE + dotIdx] *Bs[dotIdx * BLOCKSIZE + threadCol];
```


### Registers优化

**Kernel 4 & 5 (1D / 2D Blocktiling)**
* 为了减少对 SMEM 的高频访问，引入最快的存储层级——**寄存器**。
* 每个线程不再只计算 1 个结果，而是计算一个小方块（如 $8 \times 8$）。在寄存器中缓存读取的数据，执行外积计算。
* 算术强度飙升，读取 16 个元素即可支撑 64 次乘加计算。
```cpp
float regM[TM], regN[TN]; // 寄存器缓存
// ...从 SMEM 加载数据到寄存器...
for (uint resIdxM = 0; resIdxM < TM; ++resIdxM) {
  for (uint resIdxN = 0; resIdxN < TN; ++resIdxN) {
    // 全寄存器操作，极快
    threadResults[resIdxM * TN + resIdxN] += regM[resIdxM] * regN[resIdxN]; 
  }
}
```

### 指令与硬件对齐优化

**Kernel 6 (Vectorized Access & Transposition)**
* **向量化：** 使用 `float4` 类型，强制一条指令读取 128 位数据，大幅减少发射指令数。
* **转置：** 将数据存入 SMEM 时交换行列索引，提前转置，消除后续读取的地址跳跃。

**Kernel 9 (Autotuning)**
* A100 硬件架构偏好较小的分块以提升 **Occupancy（占用率）**。
* autotuning 暴力搜索得出 A100 最优参数：`BM=64, BN=64, BK=16, TM=4, TN=4`。

**Kernel 10 (Warptiling)**
* 对齐 GPU 物理架构。将原来的单层并行拆分为三级流水：
    1.  **Block**：GMEM $\rightarrow$ SMEM。
    ```cpp
    // outer-most loop over block tiles
    for (uint bkIdx = 0; bkIdx < K; bkIdx += BK) {
    // 1. Block 级：从 GMEM 加载数据到 SMEM (内部使用 float4 向量化加载)
    wt::loadFromGmem<BM, BN, BK, rowStrideA, rowStrideB>(
        N, K, A, B, As, Bs, innerRowA, innerColA, innerRowB, innerColB);
    
    __syncthreads(); // 等待 Block 内所有线程搬运完成

    // ... 进行后续计算 ...
    }
    ```
    2.  **Warp** (32线程)：SMEM $\rightarrow$ 寄存器。
    ```cpp
    // populate registers for whole warptile
    for (uint wSubRowIdx = 0; wSubRowIdx < WMITER; ++wSubRowIdx) {
    for (uint i = 0; i < TM; ++i) {
        // 2. Warp 级：将数据从共享内存 As 读取到寄存器 regM
        regM[wSubRowIdx * TM + i] =
            As[(dotIdx * BM) + warpRow * WM + wSubRowIdx * WSUBM +
            threadRowInWarp * TM + i];
    }
    }
    // 同理，将 Bs 的数据读取到 regN 中...
    ```

    3.  **Thread**：寄存器内指令级并行 (ILP)
    ```cpp
    // execute warptile matmul
    for (uint wSubRowIdx = 0; wSubRowIdx < WMITER; ++wSubRowIdx) {
    for (uint wSubColIdx = 0; wSubColIdx < WNITER; ++wSubColIdx) {
        // calculate per-thread results
        for (uint resIdxM = 0; resIdxM < TM; ++resIdxM) {
        for (uint resIdxN = 0; resIdxN < TN; ++resIdxN) {
            // 3. Thread 级：纯寄存器计算，无内存访问延迟
            threadResults[(wSubRowIdx * TM + resIdxM) * (WNITER * TN) +
                        (wSubColIdx * TN) + resIdxN] +=
                regM[wSubRowIdx * TM + resIdxM] *
                regN[wSubColIdx * TN + resIdxN];
        }
        }
    }
    }
    ```


