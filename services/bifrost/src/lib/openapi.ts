export const openApiConfig = {
	openapi: "3.0.0",
	info: {
		title: "Bifrost API Gateway",
		version: "0.1.0",
		description: "API gateway and BFF bridging services",
	},
	servers: [
		{
			url: "http://localhost:3000",
			description: "Local development",
		},
	],
}
