export const openApiConfig = {
	openapi: "3.0.0",
	info: {
		title: "Heimdall Auth Service",
		version: "0.1.0",
		description: "JWT authentication microservice",
	},
	servers: [
		{
			url: "http://localhost:8000",
			description: "Local development",
		},
	],
}
