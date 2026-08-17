'use strict';

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const INDEX_HTML = path.join(__dirname, '../index.html');

async function runTests() {
  console.log('🚀 Запуск CI/CD тестов Cosmogram...');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    const results = { total: 0, passed: 0, failed: 0, details: [] };

    // Тест 1: HTML загружается
    console.log('\n📄 Тест 1: Загрузка HTML...');
    await page.goto(`file://${INDEX_HTML}`, { waitUntil: 'networkidle0', timeout: 30000 });
    results.total++;
    results.passed++;
    results.details.push({ name: 'HTML загружается', passed: true });
    console.log('✅ HTML загружается');

    // Тест 2: Canvas существует
    console.log('\n🎨 Тест 2: Canvas существует...');
    const canvasExists = await page.evaluate(() => document.querySelector('canvas') !== null);
    results.total++;
    if (canvasExists) {
      results.passed++;
      results.details.push({ name: 'Canvas существует', passed: true });
      console.log('✅ Canvas существует');
    } else {
      results.failed++;
      results.details.push({ name: 'Canvas существует', passed: false });
      console.log('❌ Canvas не найден');
    }

    // Тест 3: Игра загружается
    console.log('\n🎮 Тест 3: Игра загружается...');
    const gameLoaded = await page.waitForFunction(() => window.gameLoaded === true, { timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    results.total++;
    if (gameLoaded) {
      results.passed++;
      results.details.push({ name: 'Игра загружается', passed: true });
      console.log('✅ Игра загружается');
    } else {
      results.failed++;
      results.details.push({ name: 'Игра загружается', passed: false });
      console.log('❌ Игра не загрузилась');
    }

    // Тест 4: Service Worker файл существует
    console.log('\n🔧 Тест 4: Service Worker существует...');
    const swExists = fs.existsSync(path.join(__dirname, '../sw.js'));
    results.total++;
    if (swExists) {
      results.passed++;
      results.details.push({ name: 'Service Worker существует', passed: true });
      console.log('✅ Service Worker существует');
    } else {
      results.failed++;
      results.details.push({ name: 'Service Worker существует', passed: false });
      console.log('❌ Service Worker не найден');
    }

    // Тест 5: guards.js существует
    console.log('\n🛡️ Тест 5: guards.js существует...');
    const guardsExists = fs.existsSync(path.join(__dirname, '../js/guards.js'));
    results.total++;
    if (guardsExists) {
      results.passed++;
      results.details.push({ name: 'guards.js существует', passed: true });
      console.log('✅ guards.js существует');
    } else {
      results.failed++;
      results.details.push({ name: 'guards.js существует', passed: false });
      console.log('❌ guards.js не найден');
    }

    // Вывод результатов
    console.log('\n' + '='.repeat(50));
    console.log('📊 РЕЗУЛЬТАТЫ ТЕСТОВ');
    console.log('='.repeat(50));
    console.log(`Всего: ${results.total}`);
    console.log(`✅ Прошло: ${results.passed}`);
    console.log(`❌ Провалено: ${results.failed}`);
    console.log('='.repeat(50) + '\n');

    // Сохраняем результаты
    const resultsPath = path.join(__dirname, 'test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`📁 Результаты сохранены в ${resultsPath}`);

    if (results.failed > 0) {
      console.error('\n❌ ТЕСТЫ ПРОВАЛЕНЫ');
      process.exit(1);
    } else {
      console.log('\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Критическая ошибка CI:', error.message);
    const errorResult = { error: error.message, stack: error.stack, total: 0, passed: 0, failed: 0 };
    fs.writeFileSync(path.join(__dirname, 'test-results.json'), JSON.stringify(errorResult, null, 2));
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

runTests();
