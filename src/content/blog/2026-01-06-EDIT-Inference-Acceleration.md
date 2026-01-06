---
title: 'EDIT'
description: '利用 AdamW 状态实现推理早退'
pubDate: 2026-01-06
heroImage: 'https://github.com/Liulinzhi-debug/picx-images-hosting/raw/master/d4749038f615e6b71228f460348a2c9f.3govu7vsh9.webp'
---



在 SFT 过程中，算法追踪 AdamW 优化器的更新量, 关注更新**幅度大且方向稳定**的参数
将一段时间内平均更新矩阵 $U_B$ 通过**Row-wise Energy** 压缩成特征对齐向量 $u$。


用 **余弦相似** 和 **KL散度** 作为判断稳定性标准

设定一个稳定性阈值 $\delta$。当 KL 散度 $D_t < \delta$ 时，认为这一步是稳定的( 算法要求**连续 $\Omega$ 步**都低于阈值 ),然后 **终止后续的所有去噪步骤**，提前输出结果

---

**论文链接**：[EDIT: Early Diffusion Inference Termination for dLLMs Based on Dynamics of Training Gradients](https://arxiv.org/pdf/2512.00670)