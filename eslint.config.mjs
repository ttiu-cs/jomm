import next from "eslint-config-next";

const config = [...next, { ignores: [".next/**", "node_modules/**", "data/**"] }];

export default config;
