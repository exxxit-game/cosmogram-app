/**
 * guards.js — Система «103 Стража»
 * Интегрирует все тесты в игру для запуска в браузере и CI/CD
 */

'use strict';

// Глобальный реестр стражей
window.GUARDS = [];

/**
 * Регистрирует стража (тест)
 * @param {string} name - имя теста
 * @param {Function} fn - функция теста, возвращает true если тест прошёл
 */
function guard(name, fn) {
  window.GUARDS.push({ name, fn });
}

/**
 * Запускает все тесты и возвращает отчёт
 * @returns {{total: number, passed: number, failed: number, details: Array}}
 */
window.runAllTests = function() {
  const results = {
    total: window.GUARDS.length,
    passed: 0,
    failed: 0,
    details: []
  };

  console.log(`\\n🛡️ Запуск ${results.total} стражей...\\n`);

  for (const g of window.GUARDS) {
    try {
      const passed = g.fn();
      if (passed) {
        results.passed++;
        console.log(`✅ GUARD PASS: ${g.name}`);
        results.details.push({ name: g.name, passed: true });
      } else {
        results.failed++;
        console.error(`❌ GUARD FAIL: ${g.name}`);
        results.details.push({ name: g.name, passed: false });
      }
    } catch (e) {
      results.failed++;
      console.error(`❌ GUARD ERROR: ${g.name} — ${e.message}`);
      results.details.push({ name: g.name, passed: false, error: e.message });
    }
  }

  console.log(`\\n📊 Итого: ${results.passed}/${results.total} passed, ${results.failed} failed\\n`);
  
  return results;
};

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { guard, runAllTests: window.runAllTests };
}
