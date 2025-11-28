/**
 * 浏览器自动化测试脚本
 * 用于测试登录和导航流程
 * 需要配合 Puppeteer 或 Playwright 使用
 */

// 使用 Puppeteer 的示例
const puppeteer = require('puppeteer');

async function autoLoginAndNavigate() {
  const browser = await puppeteer.launch({
    headless: false, // 显示浏览器窗口
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  
  try {
    // 1. 访问登录页面
    console.log('正在访问登录页面...');
    await page.goto('https://stu.ityxb.com/', { waitUntil: 'networkidle2' });
    
    // 等待页面加载
    await page.waitForTimeout(2000);
    
    // 2. 查找并填写登录表单
    console.log('正在查找登录表单...');
    
    // 尝试多种可能的登录表单选择器
    const loginSelectors = [
      'input[type="text"]',
      'input[placeholder*="账号"]',
      'input[placeholder*="手机"]',
      'input[name="username"]',
      'input[name="account"]',
      '#username',
      '#account'
    ];
    
    let usernameInput = null;
    for (const selector of loginSelectors) {
      try {
        usernameInput = await page.$(selector);
        if (usernameInput) {
          console.log(`找到用户名输入框: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!usernameInput) {
      // 截图以便调试
      await page.screenshot({ path: 'login-page.png' });
      throw new Error('未找到用户名输入框，已截图保存为 login-page.png');
    }
    
    // 填写账号
    await usernameInput.type('18174889770', { delay: 100 });
    console.log('已填写账号');
    
    // 查找密码输入框
    const passwordSelectors = [
      'input[type="password"]',
      'input[placeholder*="密码"]',
      'input[name="password"]',
      '#password'
    ];
    
    let passwordInput = null;
    for (const selector of passwordSelectors) {
      try {
        passwordInput = await page.$(selector);
        if (passwordInput) {
          console.log(`找到密码输入框: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!passwordInput) {
      throw new Error('未找到密码输入框');
    }
    
    // 填写密码
    await passwordInput.type('Qq2721355357@', { delay: 100 });
    console.log('已填写密码');
    
    // 3. 查找并点击登录按钮
    const loginButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("登录")',
      'button:has-text("登 录")',
      '.login-btn',
      '#loginBtn',
      'input[type="submit"]'
    ];
    
    let loginButton = null;
    for (const selector of loginButtonSelectors) {
      try {
        loginButton = await page.$(selector);
        if (loginButton) {
          console.log(`找到登录按钮: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!loginButton) {
      // 尝试通过文本查找
      const buttons = await page.$$eval('button', buttons => 
        buttons.filter(btn => btn.textContent.includes('登录'))
      );
      if (buttons.length > 0) {
        loginButton = buttons[0];
      }
    }
    
    if (!loginButton) {
      throw new Error('未找到登录按钮');
    }
    
    // 点击登录
    await loginButton.click();
    console.log('已点击登录按钮');
    
    // 4. 等待登录完成
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    console.log('登录成功，等待页面加载...');
    await page.waitForTimeout(3000);
    
    // 5. 查找并进入学习中心
    console.log('正在查找学习中心入口...');
    const studyCenterSelectors = [
      'a:has-text("学习中心")',
      'a[href*="study"]',
      'a[href*="center"]',
      '.study-center',
      '#studyCenter'
    ];
    
    let studyCenterLink = null;
    for (const selector of studyCenterSelectors) {
      try {
        studyCenterLink = await page.$(selector);
        if (studyCenterLink) {
          console.log(`找到学习中心入口: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!studyCenterLink) {
      // 尝试通过文本查找所有链接
      const links = await page.$$eval('a', links => 
        links.filter(link => link.textContent.includes('学习中心'))
      );
      if (links.length > 0) {
        studyCenterLink = { click: () => page.evaluate(el => el.click(), links[0]) };
      }
    }
    
    if (studyCenterLink) {
      await studyCenterLink.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      console.log('已进入学习中心');
      await page.waitForTimeout(2000);
    }
    
    // 6. 查找并点击 Spring Boot 课程
    console.log('正在查找 Spring Boot 课程...');
    const courseSelectors = [
      'a:has-text("Spring Boot")',
      'a:has-text("Spring Boot企业级开发教程")',
      '.course-item',
      '.course-card'
    ];
    
    let courseLink = null;
    const courseText = 'Spring Boot';
    
    // 通过文本内容查找
    courseLink = await page.evaluateHandle((text) => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.find(link => link.textContent.includes(text));
    }, courseText);
    
    if (courseLink && courseLink.asElement()) {
      await courseLink.asElement().click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      console.log('已进入 Spring Boot 课程页面');
      await page.waitForTimeout(3000);
      
      // 截图保存当前页面
      await page.screenshot({ path: 'course-page.png', fullPage: true });
      console.log('已截图保存课程页面: course-page.png');
    } else {
      throw new Error('未找到 Spring Boot 课程');
    }
    
    // 7. 分析答题页面结构（如果有答题入口）
    console.log('正在分析页面结构...');
    const pageContent = await page.content();
    console.log('页面标题:', await page.title());
    
    // 等待用户手动操作或继续自动化
    console.log('自动化测试完成，浏览器将保持打开状态30秒...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('自动化测试出错:', error);
    await page.screenshot({ path: 'error.png' });
  } finally {
    // 注释掉自动关闭，方便查看结果
    // await browser.close();
  }
}

// 运行自动化测试
if (require.main === module) {
  autoLoginAndNavigate().catch(console.error);
}

module.exports = { autoLoginAndNavigate };

