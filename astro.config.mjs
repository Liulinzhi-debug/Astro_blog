// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import remarkMath from 'remark-math'; // 新增
import rehypeKatex from 'rehype-katex'; // 新增
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://example.com',
	markdown: {
		remarkPlugins: [remarkMath], // 启用 Math
		rehypePlugins: [rehypeKatex], // 启用 KaTeX
	},
	integrations: [
    // 2. 针对 .mdx 文件，必须在这里再加一遍！
    mdx({
        remarkPlugins: [remarkMath],
        rehypePlugins: [rehypeKatex],
    }), 
    sitemap()
  ],
});
