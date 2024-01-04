export type Suite = ReturnType<typeof describe>;

export type It = {
  (description: string, callback: () => any): void;
  only: (description: string, callback: () => any) => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function nullIt(description: string, callback: () => any) {
  throw new Error('Describe block not found');
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
nullIt.only = (description: string, callback: () => any) => {
  throw new Error('Describe block not found');
};

let globalIsDescribingSuite = false;
let globalBeforeAll: () => any = () => {};
let globalBeforeEach: () => any = () => {};
let globalAfterEach: () => any = () => {};
let globalAfterAll: () => any = () => {};
let globalIt: It = nullIt;

function resetGlobals() {
  globalBeforeAll = () => {};
  globalBeforeEach = () => {};
  globalAfterEach = () => {};
  globalAfterAll = () => {};
  globalIt = nullIt;
}

export function beforeAll(callback: () => any) {
  assert(globalIsDescribingSuite, 'beforeAll called outside of describe');
  globalBeforeAll = callback;
}

export function beforeEach(callback: () => any) {
  assert(globalIsDescribingSuite, 'beforeEach called outside of describe');
  globalBeforeEach = callback;
}

export function afterEach(callback: () => any) {
  assert(globalIsDescribingSuite, 'afterEach called outside of describe');
  globalAfterEach = callback;
}

export function afterAll(callback: () => any) {
  assert(globalIsDescribingSuite, 'afterAll called outside of describe');
  globalAfterAll = callback;
}

export function it(description: string, callback: () => any) {
  assert(globalIsDescribingSuite, 'it called outside of describe');
  globalIt(description, callback);
}

export function describe(name: string, body: () => any) {
  console.log('describe');
  const its: { description: string; callback: () => any; only?: boolean }[] =
    [];

  function it(description: string, callback: () => any) {
    its.push({ description, callback });
  }

  it.only = (description: string, callback: () => any) => {
    its.push({ description, callback, only: true });
  };

  globalIsDescribingSuite = true;
  globalIt = it;
  const bodyResult = body();
  assert(!bodyResult?.then, 'describe() body should not be async');
  let _beforeAll = globalBeforeAll;
  let _beforeEach = globalBeforeEach;
  let _afterEach = globalAfterEach;
  let _afterAll = globalAfterAll;
  resetGlobals();
  globalIsDescribingSuite = false;

  const filterIsOnly = () => its.filter(it => it.only);

  async function run(
    callback: (x: { description: string; error?: any }) => any,
  ) {
    await _beforeAll();

    const itsToRun = filterIsOnly().length > 0 ? filterIsOnly() : its;

    const results: { description: string; error?: any }[] = [];

    for (const itToRun of itsToRun) {
      await _beforeEach();
      const result = {
        description: itToRun.description,
        error: undefined as any,
      };
      try {
        await itToRun.callback();
        results.push(result);
        callback(result);
      } catch (error) {
        result.error = error;
        results.push(result);
        callback(result);
      }
      await _afterEach();
    }

    await _afterAll();

    return results;
  }

  return {
    get hasOnly() {
      return filterIsOnly().length > 0;
    },
    run,
    name,
  };
}

export function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

export type SuiteResult = {
  name: string;
  results: { description: string; error?: any }[];
  success: boolean;
};

export async function runSuites(
  suites: Suite[],
  formatter: (result: {
    suiteName: string;
    testDescription: string;
    error?: any;
  }) => void = () => {},
) {
  const results: SuiteResult[] = [];

  // Special case of it.only
  const suitesWithOnly = suites.filter(suite => suite.hasOnly);
  const suitesToRun = suitesWithOnly.length > 0 ? suitesWithOnly : suites;

  for (const suite of suitesToRun) {
    // Move through the generator to run the suite
    const suiteResults = await suite.run(x =>
      formatter({
        suiteName: suite.name,
        testDescription: x.description,
        error: x.error,
      }),
    );
    results.push({
      name: suite.name,
      results: suiteResults,
      success: suiteResults.every(x => !x.error),
    });
  }

  return results;
}
