const TestSequencer = require("@jest/test-sequencer").default;

class CustomSequencer extends TestSequencer {
	sort (tests) {
		const orderPath = ["unit", "electron", "e2e"];
		return tests.sort((testA, testB) => {
			let indexA = -1;
			let indexB = -1;
			const reg = ".*/tests/([^/]*).*";
			const normalize = (input) => (typeof input === "string" ? input.replaceAll("\\", "/") : "");

			// move calendar and newsfeed at the end
			const pathA = normalize(testA.path);
			const pathB = normalize(testB.path);
			if (pathA.includes("e2e/modules/calendar_spec") || pathA.includes("e2e/modules/newsfeed_spec")) return 1;
			if (pathB.includes("e2e/modules/calendar_spec") || pathB.includes("e2e/modules/newsfeed_spec")) return -1;

			const matchA = new RegExp(reg, "g").exec(pathA);
			if (matchA && matchA.length > 1) indexA = orderPath.indexOf(matchA[1]);

			const matchB = new RegExp(reg, "g").exec(pathB);
			if (matchB && matchB.length > 1) indexB = orderPath.indexOf(matchB[1]);

			if (indexA === indexB) return 0;

			if (indexA === -1) return 1;
			if (indexB === -1) return -1;
			return indexA < indexB ? -1 : 1;
		});
	}
}

module.exports = CustomSequencer;
