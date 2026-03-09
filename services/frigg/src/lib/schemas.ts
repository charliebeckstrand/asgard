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

export const HealthResponseSchema = z
	.object({
		status: z.string(),
		service: z.string(),
	})
	.openapi('HealthResponse')

const ValidationIssueSchema = z.object({
	level: z.enum(['error', 'warning']),
	message: z.string(),
})

const ServiceValidationSchema = z.object({
	service: z.string(),
	status: z.enum(['pass', 'warn', 'fail']),
	issues: z.array(ValidationIssueSchema),
})

export const ValidateResponseSchema = z
	.object({
		status: z.enum(['pass', 'warn', 'fail']),
		services: z.array(ServiceValidationSchema),
	})
	.openapi('ValidateResponse')

export const ValidateServiceResponseSchema = z
	.object({
		service: z.string(),
		status: z.enum(['pass', 'warn', 'fail']),
		issues: z.array(ValidationIssueSchema),
	})
	.openapi('ValidateServiceResponse')

const SecretInfoSchema = z.object({
	key: z.string(),
	owner: z.string(),
	consumers: z.array(z.string()),
	consistent: z.boolean(),
	generated: z.boolean(),
})

export const SecretsStatusResponseSchema = z
	.object({
		status: z.enum(['healthy', 'unhealthy']),
		secrets: z.array(SecretInfoSchema),
	})
	.openapi('SecretsStatusResponse')
