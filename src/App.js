import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import dbLocal from './db';
import { encryptData, decryptData } from './crypto';
import { Bar, Pie } from 'react-chartjs-2';
import moment from 'moment';
import axios from 'axios';
import DOMPurify from 'dompurify';
import Papa from 'papaparse';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import {
  HomeIcon,
  PlusCircleIcon,
  TagIcon,
  ListBulletIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const App = () => {
  // State for user authentication and session
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cryptoKey, setCryptoKey] = useState('');

  // State for transactions
  const [transactions, setTransactions] = useState([]);
  const [newTransaction, setNewTransaction] = useState({
    date: moment().format('YYYY-MM-DD'),
    amount: '',
    category: '',
    note: '',
    type: 'expense',
    currency: 'VND',
  });
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // State for categories
  const [categories, setCategories] = useState(['Food', 'Shopping', 'Travel']);
  const [newCategory, setNewCategory] = useState('');

  // State for filters and UI
  const [filter, setFilter] = useState('all');
  const [darkMode, setDarkMode] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(24000); // Default USD to VND rate
  const [budgetLimit, setBudgetLimit] = useState(0);
  const [monthlySpending, setMonthlySpending] = useState(0);
  const [currentView, setCurrentView] = useState('home'); // Track active view

  // Fetch USD to VND exchange rate
  const fetchExchangeRate = useCallback(async () => {
    try {
      const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
      setExchangeRate(response.data.rates.VND);
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    }
  }, []);

  // Check budget limit and calculate monthly spending
  const checkBudgetLimit = useCallback(
    (transactions) => {
      const currentMonth = moment().format('YYYY-MM');
      const totalSpending = transactions
        .filter(
          (t) =>
            t.type === 'expense' &&
            moment(t.date).format('YYYY-MM') === currentMonth
        )
        .reduce((sum, t) => sum + t.amountInVND, 0);
      setMonthlySpending(totalSpending);
      if (totalSpending > budgetLimit && budgetLimit > 0) {
        alert(
          `Warning: This month's spending (${totalSpending.toLocaleString()} VND) exceeds the budget limit of ${budgetLimit.toLocaleString()} VND!`
        );
      }
    },
    [budgetLimit]
  );

  // Load transactions from local Dexie and Firestore
  const loadTransactions = useCallback(
    async (userId) => {
      if (!userId) {
        console.error('No userId, skipping transaction load');
        return;
      }
      try {
        const localTransactions = await dbLocal.transactions.toArray();
        const querySnapshot = await getDocs(collection(db, 'transactions'));
        const cloudTransactions = querySnapshot.docs
          .filter((doc) => doc.data().userId === userId)
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
            amount: decryptData(doc.data().amount),
            amountInVND: decryptData(doc.data().amountInVND),
            note: decryptData(doc.data().note),
          }));
        const allTransactions = [
          ...localTransactions,
          ...cloudTransactions.filter(
            (ct) => !localTransactions.some((lt) => lt.id === ct.id)
          ),
        ];
        setTransactions(allTransactions);
        checkBudgetLimit(allTransactions);
      } catch (error) {
        console.error('Error loading transactions:', error);
      }
    },
    [checkBudgetLimit]
  );

  // Load categories from Firestore
  const loadCategories = useCallback(async (userId) => {
    if (!userId) {
      console.error('No userId, skipping category load');
      setCategories(['Food', 'Shopping', 'Travel']);
      return;
    }
    try {
      const querySnapshot = await getDocs(collection(db, 'categories'));
      const userCategories = querySnapshot.docs
        .filter((doc) => doc.data().userId === userId)
        .map((doc) => doc.id);
      setCategories(
        userCategories.length ? userCategories : ['Food', 'Shopping', 'Travel']
      );
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories(['Food', 'Shopping', 'Travel']);
    }
  }, []);

  // Load settings (budget limit) from Firestore
  const loadSettings = useCallback(async (userId) => {
    if (!userId) {
      console.error('No userId, skipping settings load');
      return;
    }
    try {
      const docSnap = await getDocs(collection(db, 'settings'));
      const settings = docSnap.docs.find((doc) => doc.id === userId);
      if (settings) {
        setBudgetLimit(settings.data().budgetLimit || 0);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }, []);

  // Handle user login
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      sessionStorage.setItem('cryptoKey', cryptoKey);
      setEmail('');
      setPassword('');
      setCryptoKey('');
    } catch (error) {
      alert('Login error: ' + error.message);
    }
  };

  // Handle user logout
  const handleLogout = async () => {
    try {
      await signOut(auth);
      sessionStorage.removeItem('cryptoKey');
      setUser(null);
      setTransactions([]);
      setCategories(['Food', 'Shopping', 'Travel']);
      setBudgetLimit(0);
      setCurrentView('home');
    } catch (error) {
      alert('Logout error: ' + error.message);
    }
  };

  // Add a new transaction
  const addTransaction = async (e) => {
    e.preventDefault();
    if (!user) return;

    const sanitizedNote = DOMPurify.sanitize(newTransaction.note);
    const amountInVND =
      newTransaction.currency === 'USD'
        ? newTransaction.amount * exchangeRate
        : newTransaction.amount;
    const transaction = {
      date: newTransaction.date,
      amount: parseFloat(newTransaction.amount),
      amountInVND: parseFloat(amountInVND),
      category: newTransaction.category,
      note: sanitizedNote,
      type: newTransaction.type,
      currency: newTransaction.currency,
      userId: user.uid,
      id: Date.now().toString(), // Temporary ID for local storage
    };

    const encryptedTransaction = {
      ...transaction,
      amount: encryptData(transaction.amount),
      amountInVND: encryptData(transaction.amountInVND),
      note: encryptData(transaction.note),
    };

    try {
      await dbLocal.transactions.add(transaction);
      const docRef = await addDoc(
        collection(db, 'transactions'),
        encryptedTransaction
      );
      transaction.id = docRef.id; // Update ID with Firestore ID
      await dbLocal.transactions.put(transaction);
      setTransactions([...transactions, transaction]);
      setNewTransaction({
        date: moment().format('YYYY-MM-DD'),
        amount: '',
        category: '',
        note: '',
        type: 'expense',
        currency: 'VND',
      });
      checkBudgetLimit([...transactions, transaction]);
      setCurrentView('transactions'); // Switch to transaction list after adding
    } catch (error) {
      alert('Error adding transaction: ' + error.message);
    }
  };

  // Start editing a transaction
  const startEditing = (transaction) => {
    setEditingTransaction({ ...transaction });
    setIsEditing(true);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingTransaction(null);
    setIsEditing(false);
  };

  // Update an existing transaction
  const updateTransaction = async (e) => {
    e.preventDefault();
    if (!user || !editingTransaction) return;

    const sanitizedNote = DOMPurify.sanitize(editingTransaction.note);
    const amountInVND =
      editingTransaction.currency === 'USD'
        ? editingTransaction.amount * exchangeRate
        : editingTransaction.amount;
    const updatedTransaction = {
      date: editingTransaction.date,
      amount: parseFloat(editingTransaction.amount),
      amountInVND: parseFloat(amountInVND),
      category: editingTransaction.category,
      note: sanitizedNote,
      type: editingTransaction.type,
      currency: editingTransaction.currency,
      userId: user.uid,
      id: editingTransaction.id,
    };

    const encryptedTransaction = {
      ...updatedTransaction,
      amount: encryptData(updatedTransaction.amount),
      amountInVND: encryptData(updatedTransaction.amountInVND),
      note: encryptData(updatedTransaction.note),
    };

    try {
      await dbLocal.transactions.put(updatedTransaction);
      await setDoc(doc(db, 'transactions', editingTransaction.id), encryptedTransaction);
      setTransactions(
        transactions.map((t) =>
          t.id === editingTransaction.id ? updatedTransaction : t
        )
      );
      cancelEditing();
      checkBudgetLimit([...transactions]);
    } catch (error) {
      alert('Error updating transaction: ' + error.message);
    }
  };

  // Delete a transaction
  const deleteTransaction = async (id) => {
    if (!user) return;
    try {
      await dbLocal.transactions.delete(id);
      await deleteDoc(doc(db, 'transactions', id));
      setTransactions(transactions.filter((t) => t.id !== id));
      checkBudgetLimit(transactions.filter((t) => t.id !== id));
    } catch (error) {
      alert('Error deleting transaction: ' + error.message);
    }
  };

  // Add a new category
  const addCategory = async (newCategory) => {
    if (!user || !newCategory) return;
    try {
      await setDoc(doc(db, 'categories', newCategory), { userId: user.uid });
      setCategories([...categories, newCategory]);
      setNewCategory('');
    } catch (error) {
      alert('Error adding category: ' + error.message);
    }
  };

  // Delete a category
  const deleteCategory = async (category) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'categories', category));
      setCategories(categories.filter((c) => c !== category));
    } catch (error) {
      alert('Error deleting category: ' + error.message);
    }
  };

  // Save budget limit to Firestore
  const saveBudgetLimit = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'settings', user.uid), {
        budgetLimit,
        userId: user.uid,
      });
      alert('Budget limit saved');
    } catch (error) {
      alert('Error saving budget limit: ' + error.message);
    }
  };

  // Export transactions to CSV
  const exportToCSV = () => {
    const csvData = filteredTransactions.map((t) => ({
      Date: t.date,
      Category: t.category,
      Amount: t.amount,
      Currency: t.currency,
      AmountInVND: t.amountInVND,
      Note: t.note,
      Type: t.type === 'expense' ? 'Expense' : 'Income',
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_${moment().format('YYYY-MM-DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Load user data on auth state change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('Current User:', currentUser ? currentUser.uid : null);
      setUser(currentUser);
      if (currentUser) {
        loadTransactions(currentUser.uid);
        loadCategories(currentUser.uid);
        loadSettings(currentUser.uid);
        fetchExchangeRate();
      }
    });
    return () => unsubscribe();
  }, [loadTransactions, loadCategories, loadSettings, fetchExchangeRate]);

  // Filter transactions based on selected filter
  const filteredTransactions = transactions.filter((t) => {
    const date = moment(t.date);
    if (filter === 'day') return date.isSame(moment(), 'day');
    if (filter === 'week') return date.isSame(moment(), 'week');
    if (filter === 'month') return date.isSame(moment(), 'month');
    if (filter === 'year') return date.isSame(moment(), 'year');
    return true;
  });

  // Chart.js data for Bar and Pie charts
  const barData = {
    labels: Array.from(new Set(filteredTransactions.map((t) => t.date))).sort(),
    datasets: [
      {
        label: 'Expenses (VND)',
        data: Array.from(new Set(filteredTransactions.map((t) => t.date)))
          .sort()
          .map((date) =>
            filteredTransactions
              .filter((t) => t.type === 'expense' && t.date === date)
              .reduce((sum, t) => sum + t.amountInVND, 0)
          ),
        backgroundColor: '#FF6384',
      },
      {
        label: 'Income (VND)',
        data: Array.from(new Set(filteredTransactions.map((t) => t.date)))
          .sort()
          .map((date) =>
            filteredTransactions
              .filter((t) => t.type === 'income' && t.date === date)
              .reduce((sum, t) => sum + t.amountInVND, 0)
          ),
        backgroundColor: '#36A2EB',
      },
    ],
  };

  const pieData = {
    labels: categories,
    datasets: [
      {
        data: categories.map((cat) =>
          filteredTransactions
            .filter((t) => t.type === 'expense' && t.category === cat)
            .reduce((sum, t) => sum + t.amountInVND, 0)
        ),
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
      },
    ],
  };

  // Chart.js options for responsive charts
  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Amount (VND)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Date',
        },
      },
    },
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''}`}>
      <div className="bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-300 pb-16">
        {user ? (
          <>
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 shadow p-4 flex justify-between items-center sticky top-0 z-10">
              <h1 className="text-2xl font-bold dark:text-white">InaExMe</h1>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className="p-2 rounded bg-gray-200 dark:bg-gray-700 dark:text-white"
                >
                  {darkMode ? 'Light Mode' : 'Dark Mode'}
                </button>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded bg-red-500 text-white"
                >
                  Logout
                </button>
              </div>
            </header>

            {/* Main Content */}
            <main className="container mx-auto p-4">
              {/* Home: Monthly Spending Summary */}
              {currentView === 'home' && (
                <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                  <h2 className="text-xl font-semibold dark:text-white mb-2">
                    Monthly Spending Summary ({moment().format('MM/YYYY')})
                  </h2>
                  <p className="dark:text-gray-300">
                    Total Spending: {monthlySpending.toLocaleString()} VND
                  </p>
                  <p className="dark:text-gray-300">
                    Budget Limit: {budgetLimit.toLocaleString()} VND
                  </p>
                  {monthlySpending > budgetLimit && budgetLimit > 0 && (
                    <p className="text-red-500 font-semibold mt-2">
                      Warning: You have exceeded your budget limit!
                    </p>
                  )}
                  <div className="mt-4">
                    <label className="dark:text-white">Set Budget Limit (VND):</label>
                    <input
                      type="number"
                      value={budgetLimit}
                      onChange={(e) => setBudgetLimit(parseFloat(e.target.value) || 0)}
                      className="ml-2 p-2 border rounded dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      onClick={saveBudgetLimit}
                      className="ml-2 p-2 bg-blue-500 text-white rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Add Transaction */}
              {currentView === 'add' && (
                <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                  <h2 className="text-xl font-semibold dark:text-white mb-2">
                    Add Transaction
                  </h2>
                  <form onSubmit={addTransaction}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block dark:text-white">Date</label>
                        <input
                          type="date"
                          value={newTransaction.date}
                          onChange={(e) =>
                            setNewTransaction({
                              ...newTransaction,
                              date: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block dark:text-white">Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={newTransaction.amount}
                          onChange={(e) =>
                            setNewTransaction({
                              ...newTransaction,
                              amount: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        />
                      </div>
                      <div>
                        <label className="block dark:text-white">Category</label>
                        <select
                          value={newTransaction.category}
                          onChange={(e) =>
                            setNewTransaction({
                              ...newTransaction,
                              category: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        >
                          <option value="">Select Category</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block dark:text-white">Note</label>
                        <input
                          type="text"
                          value={newTransaction.note}
                          onChange={(e) =>
                            setNewTransaction({
                              ...newTransaction,
                              note: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block dark:text-white">Type</label>
                        <select
                          value={newTransaction.type}
                          onChange={(e) =>
                            setNewTransaction({
                              ...newTransaction,
                              type: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                        </select>
                      </div>
                      <div>
                        <label className="block dark:text-white">Currency</label>
                        <select
                          value={newTransaction.currency}
                          onChange={(e) =>
                            setNewTransaction({
                              ...newTransaction,
                              currency: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        >
                          <option value="VND">VND</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="mt-4 p-2 bg-blue-500 text-white rounded"
                    >
                      Add Transaction
                    </button>
                  </form>
                </div>
              )}

              {/* Category Management */}
              {currentView === 'categories' && (
                <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                  <h2 className="text-xl font-semibold dark:text-white mb-2">
                    Manage Categories
                  </h2>
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="New category name"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="p-2 border rounded dark:bg-gray-700 dark:text-white"
                    />
                    <button
                      onClick={() => addCategory(newCategory)}
                      className="ml-2 p-2 bg-blue-500 text-white rounded"
                    >
                      Add Category
                    </button>
                  </div>
                  <ul className="list-disc pl-5 dark:text-white">
                    {categories.map((cat) => (
                      <li key={cat} className="flex justify-between items-center">
                        {cat}
                        <button
                          onClick={() => deleteCategory(cat)}
                          className="ml-2 p-1 bg-red-500 text-white rounded"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Transaction List */}
              {currentView === 'transactions' && (
                <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                  <h2 className="text-xl font-semibold dark:text-white mb-2">
                    Transaction List
                  </h2>
                  <div className="mb-4">
                    <label className="dark:text-white">Filter:</label>
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="ml-2 p-2 border rounded dark:bg-gray-700 dark:text-white"
                    >
                      <option value="all">All</option>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                    <button
                      onClick={exportToCSV}
                      className="ml-2 p-2 bg-green-500 text-white rounded"
                    >
                      Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full table-auto">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-700">
                          <th className="p-2 dark:text-white">Date</th>
                          <th className="p-2 dark:text-white">Category</th>
                          <th className="p-2 dark:text-white">Amount</th>
                          <th className="p-2 dark:text-white">Type</th>
                          <th className="p-2 dark:text-white">Note</th>
                          <th className="p-2 dark:text-white">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((t) => (
                          <tr key={t.id} className="border-b dark:border-gray-700">
                            <td className="p-2 dark:text-white">{t.date}</td>
                            <td className="p-2 dark:text-white">{t.category}</td>
                            <td className="p-2 dark:text-white">
                              {t.amount.toLocaleString()} {t.currency}
                            </td>
                            <td className="p-2 dark:text-white">
                              {t.type === 'expense' ? 'Expense' : 'Income'}
                            </td>
                            <td className="p-2 dark:text-white">{t.note}</td>
                            <td className="p-2">
                              <button
                                onClick={() => startEditing(t)}
                                className="mr-2 p-1 bg-blue-500 text-white rounded"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deleteTransaction(t.id)}
                                className="p-1 bg-red-500 text-white rounded"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Charts */}
              {currentView === 'charts' && (
                <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                  <h2 className="text-xl font-semibold dark:text-white mb-2">
                    Statistics
                  </h2>
                  <div className="mb-4" style={{ height: '300px' }}>
                    <Bar data={barData} options={barOptions} />
                  </div>
                  <div style={{ height: '300px' }}>
                    <Pie data={pieData} options={pieOptions} />
                  </div>
                </div>
              )}

              {/* Edit Transaction Modal */}
              {isEditing && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
                    <h2 className="text-xl font-semibold dark:text-white mb-4">
                      Edit Transaction
                    </h2>
                    <form onSubmit={updateTransaction}>
                      <div className="mb-4">
                        <label className="block dark:text-white">Date</label>
                        <input
                          type="date"
                          value={editingTransaction.date}
                          onChange={(e) =>
                            setEditingTransaction({
                              ...editingTransaction,
                              date: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        />
                      </div>
                      <div className="mb-4">
                        <label className="block dark:text-white">Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editingTransaction.amount}
                          onChange={(e) =>
                            setEditingTransaction({
                              ...editingTransaction,
                              amount: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        />
                      </div>
                      <div className="mb-4">
                        <label className="block dark:text-white">Category</label>
                        <select
                          value={editingTransaction.category}
                          onChange={(e) =>
                            setEditingTransaction({
                              ...editingTransaction,
                              category: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        >
                          <option value="">Select Category</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-4">
                        <label className="block dark:text-white">Note</label>
                        <input
                          type="text"
                          value={editingTransaction.note}
                          onChange={(e) =>
                            setEditingTransaction({
                              ...editingTransaction,
                              note: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                      <div className="mb-4">
                        <label className="block dark:text-white">Type</label>
                        <select
                          value={editingTransaction.type}
                          onChange={(e) =>
                            setEditingTransaction({
                              ...editingTransaction,
                              type: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                        </select>
                      </div>
                      <div className="mb-4">
                        <label className="block dark:text-white">Currency</label>
                        <select
                          value={editingTransaction.currency}
                          onChange={(e) =>
                            setEditingTransaction({
                              ...editingTransaction,
                              currency: e.target.value,
                            })
                          }
                          className="w-full p-2 border rounded dark:bg-gray-700 dark:text-white"
                          required
                        >
                          <option value="VND">VND</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="p-2 bg-gray-500 text-white rounded"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="p-2 bg-blue-500 text-white rounded"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </main>

            {/* Bottom Navigation Bar */}
            <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-lg flex justify-around items-center p-2 z-10">
              <button
                onClick={() => setCurrentView('home')}
                className={`flex flex-col items-center p-2 ${
                  currentView === 'home' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-300'
                }`}
              >
                <HomeIcon className="w-6 h-6" />
                <span className="text-xs">Home</span>
              </button>
              <button
                onClick={() => setCurrentView('add')}
                className={`flex flex-col items-center p-2 ${
                  currentView === 'add' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-300'
                }`}
              >
                <PlusCircleIcon className="w-6 h-6" />
                <span className="text-xs">Add</span>
              </button>
              <button
                onClick={() => setCurrentView('categories')}
                className={`flex flex-col items-center p-2 ${
                  currentView === 'categories' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-300'
                }`}
              >
                <TagIcon className="w-6 h-6" />
                <span className="text-xs">Categories</span>
              </button>
              <button
                onClick={() => setCurrentView('transactions')}
                className={`flex flex-col items-center p-2 ${
                  currentView === 'transactions' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-300'
                }`}
              >
                <ListBulletIcon className="w-6 h-6" />
                <span className="text-xs">Transactions</span>
              </button>
              <button
                onClick={() => setCurrentView('charts')}
                className={`flex flex-col items-center p-2 ${
                  currentView === 'charts' ? 'text-blue-500' : 'text-gray-500 dark:text-gray-300'
                }`}
              >
                <ChartBarIcon className="w-6 h-6" />
                <span className="text-xs">Charts</span>
              </button>
            </nav>
          </>
        ) : (
          <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
              <h2 className="text-2xl font-bold mb-4">Login</h2>
              <form onSubmit={handleLogin}>
                <div className="mb-4">
                  <label className="block">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block">Crypto Key</label>
                  <input
                    type="password"
                    value={cryptoKey}
                    onChange={(e) => setCryptoKey(e.target.value)}
                    className="w-full p-2 border rounded"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full p-2 bg-blue-500 text-white rounded"
                >
                  Login
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;