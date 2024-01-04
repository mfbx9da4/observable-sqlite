export type Suite = ReturnType<typeof describe>;

export function describe(name: string) {
  let beforeAll: () => any = () => {};
  let beforeEach: () => any = () => {};
  let afterEach: () => any = () => {};
  let afterAll: () => any = () => {};
  const its: { description: string; callback: () => any; only?: boolean }[] =
    [];

  function it(description: string, callback: () => any) {
    its.push({ description, callback });
  }

  it.only = (description: string, callback: () => any) => {
    its.push({ description, callback, only: true });
  };

  const filterIsOnly = () => its.filter(it => it.only);

  async function run() {
    await beforeAll();

    const itsToRun = filterIsOnly().length > 0 ? filterIsOnly() : its;

    const results: { description: string; error?: any }[] = [];

    for (const it of itsToRun) {
      await beforeEach();
      try {
        await it.callback();
        results.push({ description: it.description });
      } catch (error) {
        results.push({ description: it.description, error });
      }
      await afterEach();
    }

    await afterAll();
  }

  return {
    get hasOnly() {
      return filterIsOnly().length > 0;
    },
    run,
    name,
    set beforeAll(callback: () => any) {
      beforeAll = callback;
    },
    set beforeEach(callback: () => any) {
      beforeEach = callback;
    },
    set afterEach(callback: () => any) {
      afterEach = callback;
    },
    set afterAll(callback: () => any) {
      afterAll = callback;
    },
    it,
  };
}

export function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}
