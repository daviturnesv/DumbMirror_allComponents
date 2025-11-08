module.exports = async function jestConfig () {
	return {
		verbose: true,
		testTimeout: 20000,
		testSequencer: "<rootDir>/tests/utils/test_sequencer.js",
		projects: [
			{
				displayName: "unit",
				globalSetup: "<rootDir>/tests/unit/helpers/global-setup.js",
				moduleNameMapper: {
					logger: "<rootDir>/js/logger.js",
					node_helper: "<rootDir>/js/node_helper.js"
				},
				testMatch: ["**/tests/unit/**/*.[jt]s?(x)"],
				testPathIgnorePatterns: [
					"<rootDir>/tests/unit/mocks",
					"<rootDir>/tests/unit/helpers",
					"<rootDir>/modules/MMM-Remote-Control/tests/unit"
				]
			},
			{
				displayName: "electron",
				testMatch: ["**/tests/electron/**/*.[jt]s?(x)"],
				testPathIgnorePatterns: ["<rootDir>/tests/electron/helpers"]
			},
			{
				displayName: "e2e",
				testMatch: ["**/tests/e2e/**/*.[jt]s?(x)"],
				modulePaths: ["<rootDir>/js/"],
				testPathIgnorePatterns: ["<rootDir>/tests/e2e/helpers", "<rootDir>/tests/e2e/mocks"]
			}
		],
		collectCoverageFrom: ["./clientonly/**/*.js", "./js/**/*.js", "./modules/default/**/*.js", "./serveronly/**/*.js"],
		coverageReporters: ["lcov", "text"],
		coverageProvider: "v8"
	};
};
