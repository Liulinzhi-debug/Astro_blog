---
title: 'Context-Aware Initialization'
description: '两个先验策略'
pubDate: 2026-01-05
heroImage: 'https://github.com/Liulinzhi-debug/picx-images-hosting/raw/master/0b6caba9e4a102544343dbac032c2823.465ywn7kh.webp'
---

基于 **Fast-dLLM** 框架，提出了一种利用小模型提供先验信息来优化初始化状态的方法



论文设计了两种基于小模型先验的初始化策略：

1.  **Token 注入**：
    直接将小模型生成的 Token 填入部分位置。具体操作是设定一个概率 $\rho$，决定每个位置是填入小模型的词还是保持 Mask。

2.  **嵌入插值**：
    在**嵌入层 (Embedding Layer)** 进行操作，将 `[MASK]` 的向量和小模型生成词的向量按比例混合。公式如下：

    $$\tilde{e} = (1-\alpha) \cdot e_{\text{MASK}} + \alpha \cdot e_{\text{SmallModel}}$$

#### 纠错机制

引入了**基于置信度的重掩码 (Remasking)** 机制。在解码过程中，如果扩散模型发现某个被注入的词**置信度 (Confidence)** 低于阈值，则表明该先验不可靠，模型会将该词重新 Mask 掉并重新生成。


#### 实验评价

效果不佳