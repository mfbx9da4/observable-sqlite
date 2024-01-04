import { open } from '@op-engineering/op-sqlite';
import { init } from 'observable-sqlite';
import { assert, describe, it } from './suiteMochaCompat';

type User = {
  id: number;
  name: string;
};

export const tests = describe('Observable queries', () => {
  const rawDb = open({
    name: 'myDB',
    location: '../files/databases',
  });

  rawDb.execute(/* sql */ `DROP TABLE IF EXISTS users;`);
  rawDb.execute(
    /* sql */ `CREATE TABLE IF NOT EXISTS users ( id INT PRIMARY KEY, name TEXT );`,
  );

  const db = init(rawDb);

  it('should work', () => {
    const query = db.query<User>('SELECT * FROM users', [], {
      users: '*',
    });
    let i = 0;
    const unsubscribe = query.subscribe(data => {
      console.log('data.length', data.length);
      assert(data.length === i++, 'should have the correct length');
    });
    db.mutation('INSERT INTO users (id, name) VALUES (1, "John")', [], {
      users: [1],
    });
    db.mutation('INSERT INTO users (id, name) VALUES (2, "Jane")', [], {
      users: [2],
    });
    assert(i === 3, 'should finish with the correct length');
    unsubscribe();
  });
});
