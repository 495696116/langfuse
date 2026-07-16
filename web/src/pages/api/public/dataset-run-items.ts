import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetDatasetRunItemsV1Query,
  GetDatasetRunItemsV1Response,
  PostDatasetRunItemsV1Body,
  PostDatasetRunItemsV1Response,
} from "@/src/features/public-api/types/datasets";
import {
  createDatasetRunItemForApi,
  listDatasetRunItemsForApi,
} from "@/src/features/datasets/server/publicDatasetService";
import { DATASET_RUN_ITEMS_DEPRECATION } from "@/src/features/public-api/server/deprecations";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Dataset Run Item",
    bodySchema: PostDatasetRunItemsV1Body,
    responseSchema: PostDatasetRunItemsV1Response,
    rateLimitResource: "datasets",
    fn: async ({ body, auth, res }) => {
      return await createDatasetRunItemForApi({ body, auth, res });
    },
  }),
  GET: createAuthedProjectAPIRoute({
    name: "Get Dataset Run Items",
    querySchema: GetDatasetRunItemsV1Query,
    responseSchema: GetDatasetRunItemsV1Response,
    deprecation: DATASET_RUN_ITEMS_DEPRECATION,
    rateLimitResource: "datasets",
    fn: async ({ query, auth }) => {
      return await listDatasetRunItemsForApi({
        datasetId: query.datasetId,
        runName: query.runName,
        projectId: auth.scope.projectId,
        limit: query.limit,
        page: query.page,
      });
    },
  }),
});
