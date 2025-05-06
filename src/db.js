import Dexie from 'dexie';

const db = new Dexie('BudgetDB');
db.version(1).stores({
  transactions: '++id,date,amount,amountInVND,category,note,type,currency',
});

export default db;