import { Radio } from "@mantine/core";
import { useState } from "react";
import { appearancePreference, saveAppearance } from "#/features/command-center/appearance";

export function AppearanceControls() {
	const [appearance, setAppearance] = useState(() => appearancePreference().preference);
	return (
		<Radio.Group
			label="Appearance"
			value={appearance}
			onChange={(value) => setAppearance(saveAppearance(value).preference)}
		>
			<Radio value="system" label="System" />
			<Radio value="light" label="Light" />
			<Radio value="dark" label="Dark" />
		</Radio.Group>
	);
}
