import { z } from '@hono/zod-openapi'

export const HealthStatusSchema = z
	.enum(['healthy', 'degraded', 'unhealthy'])
	.openapi({ description: 'Service health status' })

export const ServiceReachabilitySchema = z
	.enum(['healthy', 'degraded', 'unreachable'])
	.openapi({ description: 'Upstream service reachability' })

export const CircuitBreakerStateSchema = z
	.enum(['closed', 'open', 'half-open'])
	.openapi({ description: 'Circuit breaker state' })

export const LogLevelSchema = z
	.enum(['debug', 'info', 'warn', 'error', 'fatal'])
	.openapi({ description: 'Log severity level' })

export const NodeEnvSchema = z
	.enum(['development', 'production', 'test'])
	.default('development')
	.openapi({ description: 'Runtime environment' })

export const ConnectionStatusSchema = z
	.enum(['up', 'down', 'unknown'])
	.openapi({ description: 'Connection status' })
