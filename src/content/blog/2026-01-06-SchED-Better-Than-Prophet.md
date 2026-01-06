---
title: 'SchED'
description: '基于Prophet设计自适应阈值解决长文本生成的崩坏问题'
pubDate: 2026-01-06
heroImage: 'https://github.com/Liulinzhi-debug/picx-images-hosting/raw/master/0e1349748a4796ffc6a7d38d8354dd50.1ovwzarw5l.webp'
---

改变 Prophet 的“固定阈值”策略，提出了一种**基于进度的自适应阈值（Progress-Aware Schedule）**

#### Prophet 

**Prophet** (Pengxiang et al., 2025) 

计算 Token 的 `Top-2 Logit Gap`（第一名和第二名预测词的概率差）。如果这个差值大于某个**固定阈值**，直接停止生成


#### SchED
Progress-Aware Confidence Schedule

SchED 设计了一个随时间 $t$ 变化的阈值函数 $\tau(p)$，其中 $p = t/T$ 是当前的扩散进度。

SchED 计算的是**Answer Span**的平均置信度评估整体生成的稳定性。

#### 伪代码

下图展示了 SchED 的核心逻辑：计算当前步的平均置信度 $\bar{g}_t$，并与动态阈值 $\tau(p)$ 进行比对。

![SchED Algorithm](https://github.com/Liulinzhi-debug/picx-images-hosting/raw/master/0e1349748a4796ffc6a7d38d8354dd50.1ovwzarw5l.webp)

