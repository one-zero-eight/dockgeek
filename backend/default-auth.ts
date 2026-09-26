import { betterAuth } from "better-auth";
import { appDatabase } from "./auth";

export default betterAuth({
    database: appDatabase(),
    emailAndPassword: { enabled: true },
    baseURL: process.env.BETTER_AUTH_URL || (process.env.NODE_ENV === "development" ? "http://localhost:5000" : "http://localhost:5001"),
    secret: process.env.BETTER_AUTH_SECRET,
});
