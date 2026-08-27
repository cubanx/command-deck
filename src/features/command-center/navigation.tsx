import { Avatar, Group, Menu, NavLink } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { avatarUrlFor } from "#/features/command-center/avatar-url";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";

export function CommandCenterNavigation() {
	const { data: snapshot } = useQuery({ ...snapshotQueryOptions, staleTime: Number.POSITIVE_INFINITY });
	const user = snapshot?.user;
	const avatar = user?.fixture_avatar ? "/avatar-fixture.svg" : avatarUrlFor(user?.avatar_url);
	return (
		<Group justify="flex-end" wrap="wrap">
			<Menu>
				<Menu.Target>
					<Avatar component="button" aria-label="User menu" src={avatar} alt="" radius="xl">
						{user?.login?.slice(0, 1).toUpperCase() ?? "U"}
					</Avatar>
				</Menu.Target>
				<Menu.Dropdown>
					<Menu.Label>{user?.login ?? "User"}</Menu.Label>
					<Menu.Item component="a" href="/configuration">
						Configuration
					</Menu.Item>
				</Menu.Dropdown>
			</Menu>
			<NavLink component="a" href="/" label="Dashboard" />
		</Group>
	);
}
