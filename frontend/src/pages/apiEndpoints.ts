import type { HttpMethod } from '../types/api'

export interface EndpointSpec {
  id: string
  method: HttpMethod
  path: '/notes' | '/notes/{id}'
  operation: string
  summary: string
  scope: 'notes/read' | 'notes/write'
  success: string
  errors: string[]
  hasBody: boolean
  exampleBody?: string
  responseShape: string
}

const NOTE_SHAPE = '{ "data": { "noteId", "userId", "title", "content", "createdAt", "updatedAt", "version" } }'

export const ENDPOINTS: EndpointSpec[] = [
  {
    id: 'list',
    method: 'GET',
    path: '/notes',
    operation: 'ListNotes',
    summary: 'List your notes, newest first. Query: limit (1–100, default 20), nextToken.',
    scope: 'notes/read',
    success: '200 OK',
    errors: ['400 invalid limit or nextToken', '401 not authenticated', '429 throttled'],
    hasBody: false,
    responseShape: '{ "data": [ Note, … ], "meta": { "count", "limit", "nextToken" } }',
  },
  {
    id: 'create',
    method: 'POST',
    path: '/notes',
    operation: 'CreateNote',
    summary: 'Create a note. The server generates noteId, userId, timestamps and version.',
    scope: 'notes/write',
    success: '201 Created',
    errors: ['400 validation or malformed JSON', '401 not authenticated', '413 body too large', '415 not JSON'],
    hasBody: true,
    exampleBody: '{\n  "title": "My first note",\n  "content": "Learning serverless architecture"\n}',
    responseShape: NOTE_SHAPE,
  },
  {
    id: 'get',
    method: 'GET',
    path: '/notes/{id}',
    operation: 'GetNote',
    summary: 'Read one of your notes by its UUID.',
    scope: 'notes/read',
    success: '200 OK',
    errors: ['400 id is not a UUID', '401 not authenticated', '403 note belongs to another user', '404 no such note'],
    hasBody: false,
    responseShape: NOTE_SHAPE,
  },
  {
    id: 'update',
    method: 'PUT',
    path: '/notes/{id}',
    operation: 'UpdateNote',
    summary: 'Replace title and content. Optional "version" enables optimistic locking.',
    scope: 'notes/write',
    success: '200 OK',
    errors: ['400 validation', '401 not authenticated', '403 not the owner', '404 no such note', '409 stale version'],
    hasBody: true,
    exampleBody: '{\n  "title": "Updated title",\n  "content": "Updated content"\n}',
    responseShape: NOTE_SHAPE,
  },
  {
    id: 'delete',
    method: 'DELETE',
    path: '/notes/{id}',
    operation: 'DeleteNote',
    summary: 'Permanently delete one of your notes.',
    scope: 'notes/write',
    success: '200 OK',
    errors: ['400 id is not a UUID', '401 not authenticated', '403 not the owner', '404 no such note'],
    hasBody: false,
    responseShape: '{ "data": { "noteId", "deleted": true } }',
  },
]
