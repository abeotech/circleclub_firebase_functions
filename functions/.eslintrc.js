module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 10,
    "sourceType": "module",
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "require-jsdoc": 0,
    "max-len": ["error", {"code": 300}],
    "quotes": ["error", "double", {
      allowTemplateLiterals: true,
    }],
  },
};
