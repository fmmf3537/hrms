/**
 * 出差 API 单测（M5-2-B）内联断言
 */
import { BUSINESS_TRIP_PATHS } from '@/api/businessTrip';

interface Case {
  name: string;
  fn: () => void;
}

const cases: Case[] = [];

function describe(_name: string, fn: () => void): void {
  fn();
}

function it(name: string, fn: () => void): void {
  cases.push({ name, fn });
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

describe('api/businessTrip.ts', () => {
  it('create/list 调 /business-trips/requests（连字符）', () => {
    expectEqual(BUSINESS_TRIP_PATHS.requests, '/business-trips/requests', 'requests');
  });

  it('cancelBusinessTrip 调 POST /business-trips/requests/:id/cancel', () => {
    expectEqual(
      BUSINESS_TRIP_PATHS.cancel('t1'),
      '/business-trips/requests/t1/cancel',
      'cancel',
    );
  });
});

export function runBusinessTripTests(): number {
  cases.forEach((item) => item.fn());
  return cases.length;
}

export const businessTripTestCount = cases.length;
