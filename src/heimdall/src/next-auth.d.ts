import "next-auth"

declare module "next-auth" {
    interface Session {
        /** Bearer token forwarded to upstream API requests. */
        accessToken?: string
        /** Set to "RefreshTokenError" when the refresh token has expired or is invalid.
         *  Handle in your root layout to force re-login. */
        error?: string
    }
}
