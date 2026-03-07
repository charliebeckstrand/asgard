import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";

type HealthResponse = {
	status: string;
	version: string;
	uptime: number;
	services: Record<string, { status: string }>;
};

type OpenAPISpec = {
	openapi: string;
	info: { title: string };
	paths: Record<string, unknown>;
};

type ErrorResponse = {
	error: string;
	message: string;
	statusCode: number;
};

const app = createApp();

describe("Health route", () => {
	it("GET /api/health returns healthy status", async () => {
		const res = await app.request("/api/health");
		expect(res.status).toBe(200);

		const body = (await res.json()) as HealthResponse;
		expect(body.status).toBe("healthy");
		expect(body.version).toBe("0.1.0");
		expect(body.uptime).toBeTypeOf("number");
		expect(body.services).toBeDefined();
	});
});

describe("OpenAPI", () => {
	it("GET /api/openapi.json returns the spec", async () => {
		const res = await app.request("/api/openapi.json");
		expect(res.status).toBe(200);

		const spec = (await res.json()) as OpenAPISpec;
		expect(spec.openapi).toBe("3.0.0");
		expect(spec.info.title).toBe("Bifrost API Gateway");
		expect(spec.paths["/api/health"]).toBeDefined();
		expect(spec.paths["/api/users"]).toBeDefined();
	});

	it("GET /api/docs returns Swagger UI HTML", async () => {
		const res = await app.request("/api/docs");
		expect(res.status).toBe(200);

		const text = await res.text();
		expect(text).toContain("swagger-ui");
	});
});

describe("Error handling", () => {
	it("returns 404 for unknown routes", async () => {
		const res = await app.request("/unknown");
		expect(res.status).toBe(404);

		const body = (await res.json()) as ErrorResponse;
		expect(body.error).toBe("Not Found");
		expect(body.statusCode).toBe(404);
	});
});
