---
title: 'D²Cache'
description: '针对扩散大语言模型推理效率低下的问题，提出了一种免训练的双重自适应缓存策略 D²Cache。'
pubDate: '2025-10-16'
heroImage: '../../assets/blog-placeholder-2.jpg'
tags: ['Paper', 'DiffusionModel', 'LLM', 'Optimization']
---

通过“确定性先验”和“注意力滚动”分别筛选 Masked Token 和 Decoded Token

- **原文链接**: [Arxiv](https://arxiv.org/abs/2411.xxxxx)
- **代码仓库**: [GitHub](https://github.com/Kamichanw/d2Cache)


现有的自回归 KV Cache 只能处理“过去不变”的数据，而扩散模型中 Token 状态时刻在变，导致现有方法必须每一步都重新计算所有 Token 的 KV，极其耗时。


**注意力分布不均 (Uneven Attention)：**
    * 注意力主要集中在 **Prompt** 和 **已解码 (Decoded)** 的 Token 上。
    * *洞察：* Masked Token 获得的关注极少，且相邻步骤的注意力图高度相似，可以只更新高关注度的 Token。



$D^{2}$Cache 将 Token 分为两类，分别采用不同的筛选策略：

#### A. 针对 Masked Token - 确定性先验引导 (Certainty Prior)
* **目标：** 找出那些“即将被解码”的 Token。
* **指标：** 结合了 **预测置信度 (Confidence)** 和 **局部已知 Token 密度 (Density)**。
* **效果：** 仅更新处于“剧变期”的 Token。
* **额外收益：** 这种筛选机制隐式地引导模型按照类似“从左到右”的顺序生成，减少了生成顺序混乱导致的错误。

#### B. 针对 Decoded/Prompt Token - 注意力感知 (Attention-Aware)
* **目标：** 找出那些“依然重要”的上下文 Token。
* **方法：** 使用 **Attention Rollout** 算法计算全局注意力流。
* **操作：**
    * **高关注度 Token：** 重新计算 KV。
    * **低关注度 Token：** 直接复用上一步的 KV（Copy）。

