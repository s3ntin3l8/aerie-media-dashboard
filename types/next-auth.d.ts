import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: "admin" | "user";
      groups: string[];
    } & DefaultSession["user"];
  }

  interface User {
    role?: "admin" | "user";
    groups?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "user";
    groups?: string[];
  }
}
