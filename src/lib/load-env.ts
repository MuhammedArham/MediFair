import { config } from "dotenv";
// Match Next.js precedence for CLI database tools without printing secret values.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
