---
title: 'WeDLM'
description: 'WeDLM 如何通过拓扑重排序将双向注意力转化为因果掩码，解决 KV Cache 兼容性难题。'
pubDate: 2025-12-29
heroImage: 'https://github.com/Liulinzhi-debug/picx-images-hosting/raw/master/e3be3970794fa545a89a4f8b57202688.5q7wcol4kf.webp'
---

大多数 DLLM 依赖**双向注意力**，导致无法复用 KV Cache。

腾讯微信 AI 提出的 **WeDLM** 用一个巧妙的策略解决了这个问题：**拓扑重排序 (Topological Reordering)**。

### 核心创新

1.  **物理移位**：将所有“已确定”的 token 搬到序列的最前面。
2.  **逻辑保留**：通过 RoPE 位置编码保留它们原本的语义位置。
3.  **因果掩码**：因为“已确定”的都在物理最前，剩下的 Mask token 自然可以通过标准的**因果掩码 (Causal Mask)** 看到所有上下文。

![WeDLM 拓扑重排序示意图](https://github.com/Liulinzhi-debug/picx-images-hosting/raw/master/e3be3970794fa545a89a4f8b57202688.5q7wcol4kf.webp)



#### 1. 解码后的 Token 还会变吗？
**已提交（Committed）的 Token 不会变，未提交的会变。**

WeDLM 采用“流式并行解码”。它维护一个滑动窗口：
* **左侧（已提交区）**：一旦模型认为最左侧的 token 足够置信并形成连续前缀，就会将其“提交”。这些 Token **一旦提交就固定下来**，不再通过扩散过程修改。
* **右侧（窗口区）**：窗口内的 [MASK] token 会在扩散步骤中反复迭代更新，直到它们被确定并移入左侧。

下图直观展示了传统 Block Decoding（需等待整块生成）与 WeDLM 流式解码（连续提交与填充）的区别：

![WeDLM 流式并行解码 vs 块解码](https://github.com/Liulinzhi-debug/picx-images-hosting/raw/master/fa2f9734c91056139d243ff0867e7ad7.9rjvr3374h.webp)

#### 2. KV Cache 前面的内容什么时候更新？
**KV Cache 永远是“追加（Append-only）”的，不需要回退更新。**

* 由于强制使用了**因果掩码**，每一个被提交的 token，其 KV 值只依赖于它物理位置之前的 token。
* 这意味着，当一个 Token 被“提交”并移到物理最前端时，它的 KV 状态就计算完成并**永久写入 Cache**。

---
[📄 阅读原文 (arXiv:2512.22737)](https://arxiv.org/pdf/2512.22737)