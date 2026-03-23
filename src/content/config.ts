import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
	// Type-check frontmatter using a schema
	schema: ({ image }) => z.object({
		title: z.string(),
		description: z.string(),
		// 自动转换日期格式
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		// 关键修复：允许 image() 对象 OR 字符串 URL
		heroImage: z.union([image(), z.string()]).optional(),
	}),
});

export const collections = { blog };