import typescriptEslint from "typescript-eslint";

export default [
  {
    files: ["**/*.ts"],
  },
  {
    plugins: {
      "@typescript-eslint": typescriptEslint.plugin,
    },

    languageOptions: {
      parser: typescriptEslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },

    rules: {
      // 基本代码质量规则
      "curly": "error",
      "eqeqeq": "error",
      "semi": "error",
      "prefer-const": "error",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",
      "no-console": "off", // 允许 console 用于调试
      "no-debugger": "error",

      // TypeScript 核心规则 - 只保留最重要的
      "@typescript-eslint/explicit-function-return-type": "off", // 不强制函数返回类型
      "@typescript-eslint/no-explicit-any": "off", // 允许 any 类型使用
      "@typescript-eslint/no-non-null-assertion": "off", // 允许非空断言

      // 简化命名约定 - 允许常量使用 UPPER_CASE
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "default",
          format: ["camelCase"],
        },
        {
          selector: "variable",
          modifiers: ["const"],
          format: ["camelCase", "UPPER_CASE"],
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "memberLike",
          modifiers: ["private"],
          format: ["camelCase"],
          leadingUnderscore: "require",
        },
      ],
    },
  },
];