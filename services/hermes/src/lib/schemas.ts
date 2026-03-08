import { z } from 'zod'

export const ErrorSchema = z
	.object({
		error: z.string(),
		message: z.string(),
		statusCode: z.number(),
	})
	.openapi('Error')

export const MessageSchema = z
	.object({
		message: z.string(),
	})
	.openapi('Message')

export const SendMessageSchema = z
	.object({
		channel: z
			.string()
			.min(1)
			.max(255)
			.openapi({ description: 'Target channel name', example: 'user.notifications' }),
		data: z.record(z.string(), z.unknown()).default({}).openapi({ description: 'Message payload' }),
		source: z
			.string()
			.min(1)
			.max(100)
			.optional()
			.openapi({ description: 'Originating service', example: 'heimdall' }),
	})
	.openapi('SendMessage')

export const BroadcastMessageSchema = z
	.object({
		data: z
			.record(z.string(), z.unknown())
			.default({})
			.openapi({ description: 'Broadcast payload' }),
		source: z
			.string()
			.min(1)
			.max(100)
			.optional()
			.openapi({ description: 'Originating service', example: 'saga' }),
	})
	.openapi('BroadcastMessage')

export const ChannelInfoSchema = z
	.object({
		channel: z.string().openapi({ description: 'Channel name' }),
		subscribers: z.number().openapi({ description: 'Number of connected subscribers' }),
	})
	.openapi('ChannelInfo')

export const ChannelListSchema = z
	.object({
		data: z.array(ChannelInfoSchema),
		total: z.number(),
	})
	.openapi('ChannelList')

export const SendResultSchema = z
	.object({
		message: z.string(),
		channel: z.string(),
		recipients: z.number(),
	})
	.openapi('SendResult')

export const BroadcastResultSchema = z
	.object({
		message: z.string(),
		recipients: z.number(),
	})
	.openapi('BroadcastResult')
