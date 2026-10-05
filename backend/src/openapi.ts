const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'API REST per la gestione delle topologie di rete',
    version: '1.0.0',
    description:
      'API REST per controllare lo stato del servizio e creare, leggere, aggiornare ed eliminare topologie di rete. Le topologie sono persistite in MongoDB.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Backend locale' }],
  tags: [
    { name: 'Health', description: 'Stato del servizio e della connessione al database' },
    { name: 'Topologie', description: 'Operazioni sulle topologie di rete' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Verifica lo stato dell’API e di MongoDB',
        responses: {
          '200': {
            description: 'API disponibile e database connesso',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } },
          },
          '503': {
            description: 'API raggiungibile ma database non connesso',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } },
          },
        },
      },
    },
    '/api/topologies': {
      get: {
        tags: ['Topologie'],
        summary: 'Elenca le topologie salvate',
        responses: {
          '200': {
            description: 'Elenco ordinato per ID crescente',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Topology' } },
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      post: {
        tags: ['Topologie'],
        summary: 'Crea una topologia',
        description: 'L’ID della topologia viene assegnato dal server. Il corpo contiene l’intera topologia.',
        requestBody: { $ref: '#/components/requestBodies/TopologyWrite' },
        responses: {
          '201': {
            description: 'Topologia creata',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Topology' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': { $ref: '#/components/responses/ConflictError' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
    '/api/topologies/{id}': {
      parameters: [{ $ref: '#/components/parameters/TopologyId' }],
      get: {
        tags: ['Topologie'],
        summary: 'Recupera una topologia',
        responses: {
          '200': {
            description: 'Topologia trovata',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Topology' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      put: {
        tags: ['Topologie'],
        summary: 'Sostituisce una topologia esistente',
        description: 'Sostituisce nome, dispositivi e connessioni. L’ID è quello indicato nel percorso.',
        requestBody: { $ref: '#/components/requestBodies/TopologyWrite' },
        responses: {
          '200': {
            description: 'Topologia aggiornata',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Topology' } } },
          },
          '400': { $ref: '#/components/responses/ValidationError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
      delete: {
        tags: ['Topologie'],
        summary: 'Elimina una topologia',
        responses: {
          '204': { description: 'Topologia eliminata; risposta senza contenuto' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '404': { $ref: '#/components/responses/NotFoundError' },
          '500': { $ref: '#/components/responses/InternalError' },
        },
      },
    },
  },
  components: {
    parameters: {
      TopologyId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'ID numerico positivo della topologia',
        schema: { type: 'integer', minimum: 1 },
        example: 1,
      },
    },
    requestBodies: {
      TopologyWrite: {
        required: true,
        description:
          'Corpo completo della topologia. Sono ammessi al massimo 500 dispositivi e 2.000 connessioni. Il backend verifica gli ID univoci, gli IP non duplicati, gli estremi delle connessioni, gli auto-collegamenti, i collegamenti duplicati senza distinzione di direzione e la capacita delle porte degli switch.',
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/TopologyWrite' } },
        },
      },
    },
    responses: {
      ValidationError: {
        description: 'ID non valido o corpo non conforme alle regole di validazione',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      NotFoundError: {
        description: 'Topologia non trovata',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      ConflictError: {
        description: 'Conflitto con una risorsa già esistente',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      InternalError: {
        description: 'Errore interno del server',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
    },
    schemas: {
      Health: {
        type: 'object',
        required: ['status', 'database'],
        properties: {
          status: { type: 'string', enum: ['ok', 'unavailable'], example: 'ok' },
          database: { type: 'string', enum: ['connected', 'disconnected'], example: 'connected' },
        },
      },
      TopologyWrite: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'devices', 'connections'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100, example: 'Rete laboratorio' },
          devices: { type: 'array', maxItems: 500, items: { $ref: '#/components/schemas/Device' } },
          connections: { type: 'array', maxItems: 2000, items: { $ref: '#/components/schemas/Connection' } },
        },
        example: {
          name: 'Rete laboratorio',
          devices: [
            { id: 1, type: 'Router', name: 'Router-01', x: 420, y: 120, status: 'Online', ip: '192.168.1.1', hostname: 'router-main', model: 'R-1000' },
            { id: 2, type: 'Switch', name: 'Switch-01', x: 420, y: 300, status: 'Online', portCount: 8, model: 'SW-8' },
            { id: 3, type: 'PC', name: 'PC-01', x: 180, y: 460, status: 'Online', ip: '192.168.1.10', hostname: 'pc-01', operatingSystem: 'Linux' },
          ],
          connections: [{ id: 1, sourceId: 1, targetId: 2 }, { id: 2, sourceId: 2, targetId: 3 }],
        },
      },
      Topology: {
        type: 'object',
        required: ['id', 'name', 'devices', 'connections'],
        properties: {
          id: { type: 'integer', minimum: 1, example: 1 },
          name: { type: 'string', example: 'Rete laboratorio' },
          devices: { type: 'array', items: { $ref: '#/components/schemas/Device' } },
          connections: { type: 'array', items: { $ref: '#/components/schemas/Connection' } },
        },
      },
      Device: {
        oneOf: [
          { $ref: '#/components/schemas/PC' },
          { $ref: '#/components/schemas/Switch' },
          { $ref: '#/components/schemas/Router' },
        ],
        discriminator: { propertyName: 'type' },
      },
      DeviceBase: {
        type: 'object',
        required: ['id', 'type', 'name', 'x', 'y', 'status'],
        properties: {
          id: { type: 'integer', minimum: 1 },
          type: { type: 'string', enum: ['PC', 'Switch', 'Router'] },
          name: { type: 'string', minLength: 1, maxLength: 60 },
          x: { type: 'number' },
          y: { type: 'number' },
          status: { type: 'string', enum: ['Online', 'Offline'] },
          ip: { type: 'string', format: 'ipv4' },
        },
      },
      PC: {
        allOf: [
          { $ref: '#/components/schemas/DeviceBase' },
          { type: 'object', properties: {
            type: { type: 'string', enum: ['PC'] },
            hostname: { type: 'string', minLength: 1, maxLength: 255 },
            operatingSystem: { type: 'string', minLength: 1, maxLength: 255 },
          } },
        ],
      },
      Switch: {
        allOf: [
          { $ref: '#/components/schemas/DeviceBase' },
          { type: 'object', required: ['portCount'], properties: {
            type: { type: 'string', enum: ['Switch'] },
            portCount: { type: 'integer', minimum: 1 },
            model: { type: 'string', minLength: 1, maxLength: 255 },
          } },
        ],
      },
      Router: {
        allOf: [
          { $ref: '#/components/schemas/DeviceBase' },
          { type: 'object', properties: {
            type: { type: 'string', enum: ['Router'] },
            hostname: { type: 'string', minLength: 1, maxLength: 255 },
            model: { type: 'string', minLength: 1, maxLength: 255 },
          } },
        ],
      },
      Connection: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'sourceId', 'targetId'],
        properties: {
          id: { type: 'integer', minimum: 1 },
          sourceId: { type: 'integer', minimum: 1 },
          targetId: { type: 'integer', minimum: 1 },
        },
      },
      ErrorResponse: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'I dati della richiesta non sono validi.' },
              details: {
                type: 'array',
                items: { type: 'object', required: ['path', 'message'], properties: {
                  path: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'integer' }] } },
                  message: { type: 'string' },
                } },
              },
            },
          },
        },
      },
    },
  },
} as const;

export default openApiDocument;
