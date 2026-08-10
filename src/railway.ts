export async function verifyRailwayDeployment(token: string, hint: { projectId: string; serviceId: string; environmentId: string; deploymentId: string }, fetcher: typeof fetch = fetch) {
  const query = `query($projectId:String!,$serviceId:String!,$environmentId:String!){deployments(first:20,input:{projectId:$projectId,serviceId:$serviceId,environmentId:$environmentId}){edges{node{id status}}}}`;
  const response = await fetcher("https://backboard.railway.com/graphql/v2", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query, variables: hint }) });
  if (!response.ok) return null;
  const json = await response.json() as { data?: { deployments?: { edges?: Array<{ node: { id: string; status: string } }> } } };
  return json.data?.deployments?.edges?.map((edge) => edge.node).find((deployment) => deployment.id === hint.deploymentId) ?? null;
}
