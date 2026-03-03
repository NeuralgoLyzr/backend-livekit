import { apiReference } from '@scalar/express-api-reference';
import { Router } from 'express';
import redoc from 'redoc-express';
import swaggerUi from 'swagger-ui-express';

import { openApiDocument } from './openApi.js';

export function createDocsRouter(): Router {
    const router: Router = Router();

    router.get('/openapi.json', (_req, res) => {
        res.json(openApiDocument);
    });

    router.use(
        '/docs',
        swaggerUi.serve,
        swaggerUi.setup(openApiDocument, {
            explorer: true,
            customSiteTitle: 'LiveKit Voice Agent Server API',
            swaggerOptions: {
                persistAuthorization: true,
            },
        })
    );

    router.get(
        '/redoc',
        redoc({
            title: 'LiveKit Voice Agent Server API',
            specUrl: '/v1/openapi.json',
        })
    );

    router.get(
        '/scalar-docs',
        apiReference({
            pageTitle: 'LiveKit Voice Agent Server API',
            theme: 'saturn',
            url: '/v1/openapi.json',
        })
    );

    return router;
}
