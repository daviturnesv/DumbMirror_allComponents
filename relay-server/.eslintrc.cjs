module.exports = {
  env: {
    es2022: true,
    node: true
  },
  extends: [
    "standard"
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  rules: {
    quotes: ["error", "double"],
    semi: ["error", "always"],
    "space-before-function-paren": ["error", { anonymous: "never", named: "never", asyncArrow: "always" }],
    indent: "off"
  }
};

