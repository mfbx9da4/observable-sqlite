import { OPSQLiteConnection } from "@op-engineering/op-sqlite";
import React, { useEffect } from "react";

type Primitive = string | number | boolean | null | undefined;
type RecordId = string | number;
type TableName = string;
type Wildcard = "*";
type SQL = string;
type Dependencies = Record<TableName, Set<RecordId> | Wildcard>;
type ChangeSet = Record<TableName, Array<RecordId> | Wildcard>;
type Query<T> = {
  subscribe: (listener: (result: T[]) => void) => () => void;
  update: (next: {
    sql?: SQL;
    parameters?: Primitive[];
    dependencies?: Dependencies;
  }) => void;
};

type Module = {
  query: <T>(
    sql: SQL,
    parameters?: Primitive[],
    dependencies?: Dependencies
  ) => Query<T>;
  mutation: (sql: SQL, parameters?: Primitive[], changes?: ChangeSet) => any;
  mutationAsync: (
    sql: SQL,
    parameters?: Primitive[],
    changes?: ChangeSet
  ) => Promise<any>;
};

type DBSubscription = {
  unsubscribe: () => void;
  updateDependencies: (dependencies: Dependencies) => void;
};

export function init(db: OPSQLiteConnection) {
  const dbSubscriptions = new Map<() => void, Dependencies>();

  function dbSubscribe(
    dependencies: Dependencies,
    callback: () => void
  ): DBSubscription {
    dbSubscriptions.set(callback, dependencies);
    return {
      unsubscribe: () => {
        dbSubscriptions.delete(callback);
      },
      updateDependencies: (dependencies: Dependencies) => {
        dbSubscriptions.set(callback, dependencies);
      },
    };
  }

  function notifyDbSubscriptions(changes: ChangeSet) {
    outer: for (const [callback, dependencies] of dbSubscriptions.entries()) {
      for (const [tableName, recordIds] of Object.entries(changes)) {
        for (const [dependencyTableName, dependencyRecordIds] of Object.entries(
          dependencies
        )) {
          if (tableName === dependencyTableName) {
            if (
              dependencyRecordIds === "*" ||
              recordIds === "*" ||
              recordIds.some((x) => dependencyRecordIds.has(x))
            ) {
              callback();
              continue outer;
            }
          }
        }
      }
    }
  }

  function query<T>(
    sql: SQL,
    parameters: Primitive[] = [],
    dependencies: Dependencies = {}
  ) {
    let statement = db.prepareStatement(sql);
    if (parameters.length > 0) {
      statement.bind(parameters);
    }
    let result: T[];

    const listeners = new Set<(result: T[]) => void>();

    const isObserving = () => listeners.size > 0;

    const execute = () => {
      const rawResult = statement.execute();
      result = rawResult.rows?._array || [];
      listeners.forEach((listener) => listener(result));
    };

    let dbSubscription: DBSubscription;

    return {
      subscribe: (listener: (result: T[]) => void) => {
        if (!isObserving()) {
          execute();
          dbSubscription = dbSubscribe(dependencies, execute);
        }
        listeners.add(listener);
        listener(result);
        return () => {
          listeners.delete(listener);
          if (!isObserving()) dbSubscription.unsubscribe();
        };
      },
      update: (next: {
        sql?: SQL;
        parameters?: Primitive[];
        dependencies?: Dependencies;
      }) => {
        let didChange = false;
        if (next.sql && next.sql !== sql) {
          statement = db.prepareStatement(sql);
          sql = next.sql;
          didChange = true;
        }
        if (next.parameters && !parametersEqual(next.parameters, parameters)) {
          statement.bind(parameters);
          parameters = next.parameters;
          didChange = true;
        }
        if (
          next.dependencies &&
          !dependenciesEqual(next.dependencies, dependencies)
        ) {
          dbSubscription.updateDependencies(next.dependencies);
          dependencies = next.dependencies;
          didChange = true;
        }
        if (didChange && isObserving()) execute();
      },
    };
  }

  function mutation(
    sql: SQL,
    parameters: Primitive[] = [],
    changes: ChangeSet
  ) {
    let result = db.execute(sql, parameters);
    notifyDbSubscriptions(changes);
    return result;
  }

  async function mutationAsync(
    sql: SQL,
    parameters: Primitive[] = [],
    changes: ChangeSet
  ) {
    let result = await db.executeAsync(sql, parameters);
    notifyDbSubscriptions(changes);
    return result;
  }

  return {
    query,
    mutation,
    mutationAsync,
  };
}

export function hooks(module: Module) {
  function useQuery<T, U = T[]>({
    sql,
    parameters = [],
    dependencies = {},
    selector = (x) => x as unknown as U,
  }: {
    sql: SQL;
    parameters?: Primitive[];
    dependencies?: Dependencies;
    selector?: (x: T[]) => U;
  }) {
    const forceRender = React.useReducer((x) => !x, false)[1];
    const resultRef = React.useRef<U>();
    const selectorRef = React.useRef(selector);
    selectorRef.current = selector;
    const queryRef = React.useRef<Query<T>>();
    const subscriptionRef = React.useRef<() => void>();
    if (!queryRef.current) {
      queryRef.current = module.query<T>(sql, parameters, dependencies);
      subscriptionRef.current = queryRef.current.subscribe((result) => {
        resultRef.current = selectorRef.current(result);
        forceRender();
      });
    }

    queryRef.current.update({ sql, parameters, dependencies });

    useEffect(() => {
      // On unmount unsubscribe
      return () => subscriptionRef.current?.();
    }, []);

    return resultRef.current!;
  }

  return {
    useQuery,
  };
}

// #region Utils

function arraysEqual<T>(a: T[], b: T[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function setsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

function parametersEqual(a: Primitive[], b: Primitive[]) {
  if (a === b) return true;
  return arraysEqual(a, b);
}

function dependenciesEqual(a: Dependencies, b: Dependencies) {
  if (a === b) return true;
  if (Object.keys(a).length !== Object.keys(b).length) return false;
  for (const [tableName, recordIds] of Object.entries(a)) {
    const aIsWildcard = recordIds === "*";
    const bIsWildcard = b[tableName] === "*";
    // If they're not of the same type, they're not equal
    if (aIsWildcard !== bIsWildcard) return false;
    // If both are wildcards, continue
    if (aIsWildcard && bIsWildcard) continue;
    // Otherwise both are sets
    if (!setsEqual(recordIds as Set<RecordId>, b[tableName] as Set<RecordId>))
      return false;
  }
  return true;
}

// Example usage

// function example(module: Module) {
//   const { useQuery } = hooks(module);
//   const useUsers = () =>
//     useQuery({
//       sql: 'SELECT * FROM users WHERE completed = ?',
//       parameters: [false],
//       dependencies: { users: '*' },
//     });

//   module.mutation('UPDATE users SET completed = ? WHERE id = ?', [true, 1], {
//     users: [1],
//   });
// }
