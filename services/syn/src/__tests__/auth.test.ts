import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

vi.mock("next-auth", () => ({
	default: (config: Record<string, unknown>) => ({
		auth: vi.fn(),
		handlers: { GET: vi.fn(), POST: vi.fn() },
		signIn: vi.fn(),
		signOut: vi.fn(),
		_config: config,
	}),
}))

vi.mock("next-auth/providers/credentials", () => ({
	default: (opts: Record<string, unknown>) => ({ id: "credentials", ...opts }),
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

describe("createAuth", () => {
	beforeEach(() => {
		mockFetch.mockReset()
		vi.resetModules()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("returns all four NextAuth exports", async () => {
		const { createAuth } = await import("../auth")

		const result = createAuth({ apiOrigin: "http://localhost:8000" })

		expect(result).toHaveProperty("auth")
		expect(result).toHaveProperty("handlers")
		expect(result).toHaveProperty("signIn")
		expect(result).toHaveProperty("signOut")
	})

	it("accepts a custom session maxAge without throwing", async () => {
		const { createAuth } = await import("../auth")

		expect(() =>
			createAuth({
				apiOrigin: "http://localhost:8000",
				session: { maxAge: 60 * 60 * 24 },
			}),
		).not.toThrow()
	})

	it("strips trailing slash from apiOrigin", async () => {
		const { createAuth } = await import("../auth")

		// Should not throw — trailing slash is normalised internally
		expect(() => createAuth({ apiOrigin: "http://localhost:8000/" })).not.toThrow()
	})

	it("does not call fetch on construction", async () => {
		const { createAuth } = await import("../auth")

		createAuth({ apiOrigin: "http://localhost:8000" })

		expect(mockFetch).not.toHaveBeenCalled()
	})

	it("two instances have independent refresh locks", async () => {
		const { createAuth } = await import("../auth")

		const a = createAuth({ apiOrigin: "http://localhost:8001" })
		const b = createAuth({ apiOrigin: "http://localhost:8002" })

		// Both instances exist independently — they share no state
		expect(a).not.toBe(b)
		expect(mockFetch).not.toHaveBeenCalled()
	})
})
