import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { AdminApiKeyGuard } from '../src/features/admin/admin-api-key.guard';
import { FeatureFlagsController } from '../src/infrastructure/feature-flags/feature-flags.controller';

type RouteHandlerName = 'getAllFlags' | 'getFlag' | 'setFlag' | 'deleteFlag';

const adminFlagHandlers: RouteHandlerName[] = [
  'getAllFlags',
  'getFlag',
  'setFlag',
  'deleteFlag',
];

function hasAdminApiKeyGuard(guards: unknown[] | undefined): boolean {
  return (guards ?? []).includes(AdminApiKeyGuard);
}

function getHandler(name: RouteHandlerName): (...args: never[]) => unknown {
  return FeatureFlagsController.prototype[name];
}

describe('FeatureFlagsController admin security metadata', () => {
  it('protects every /admin/flags handler with AdminApiKeyGuard at controller or route level', () => {
    const controllerGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      FeatureFlagsController,
    ) as unknown[] | undefined;
    const controllerIsGuarded = hasAdminApiKeyGuard(controllerGuards);

    const unguardedHandlers = adminFlagHandlers.filter((handlerName) => {
      const routeGuards = Reflect.getMetadata(
        GUARDS_METADATA,
        getHandler(handlerName),
      ) as unknown[] | undefined;

      return !controllerIsGuarded && !hasAdminApiKeyGuard(routeGuards);
    });

    expect(unguardedHandlers).toEqual([]);
  });

  it('keeps the admin feature flag GET/POST/DELETE route contract explicit', () => {
    expect(Reflect.getMetadata(PATH_METADATA, FeatureFlagsController)).toBe(
      'admin/flags',
    );

    expect(
      adminFlagHandlers.map((handlerName) => ({
        handlerName,
        path: Reflect.getMetadata(PATH_METADATA, getHandler(handlerName)),
        method: Reflect.getMetadata(METHOD_METADATA, getHandler(handlerName)),
      })),
    ).toEqual([
      { handlerName: 'getAllFlags', path: '/', method: RequestMethod.GET },
      { handlerName: 'getFlag', path: ':key', method: RequestMethod.GET },
      { handlerName: 'setFlag', path: '/', method: RequestMethod.POST },
      { handlerName: 'deleteFlag', path: ':key', method: RequestMethod.DELETE },
    ]);
  });

  it('keeps POST /admin/flags as an idempotent admin metadata mutation', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, getHandler('setFlag'))).toBe(
      200,
    );
  });
});
