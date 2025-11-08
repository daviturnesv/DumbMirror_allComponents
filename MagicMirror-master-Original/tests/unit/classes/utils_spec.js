const Utils = require("../../../js/utils");

describe("Utils", () => {
	it("should output system information", async () => {
		await expect(Utils.logSystemInformation()).resolves.toMatch(/platform:\s+\w+/i);
	});
});
