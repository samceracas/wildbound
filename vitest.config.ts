import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration suites share one test database; with `projects`, the per-project
    // fileParallelism flag is not enough, so files never run concurrently.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
          // Exercises are the "fill in the blanks" tasks; they fail until implemented.
          exclude: ["**/*.exercise.test.ts", "**/node_modules/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "exercises",
          include: ["packages/*/src/**/*.exercise.test.ts", "apps/*/src/**/*.exercise.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["apps/api/test/**/*.test.ts", "packages/db/test/**/*.test.ts"],
          environment: "node",
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
