<!--
  懒羊羊自动化平台 - 主控制面板
  @author 懒羊羊 
-->

<template>
  <a-float-button-group
    shape="square"
    :style="{ right: '24px', bottom: '24px' }"
    trigger="click"
    @open-change="handleOpenChange"
  >
    <template #icon>
      <ThunderboltOutlined />
    </template>
    
    <a-float-button @click="handleAutoAnswer" :tooltip="'自动答题'">
      <template #icon>
        <PlayCircleOutlined />
      </template>
    </a-float-button>
    
    <a-float-button @click="handleSubmit" :tooltip="'提交作业'">
      <template #icon>
        <SendOutlined />
      </template>
    </a-float-button>
    
    <a-float-button @click="handleSettings" :tooltip="'设置'">
      <template #icon>
        <SettingOutlined />
      </template>
    </a-float-button>
  </a-float-button-group>

  <!-- 控制面板 Drawer -->
  <a-drawer
    v-model:open="drawerVisible"
    title="懒羊羊自动化平台"
    placement="right"
    :width="400"
    :closable="true"
  >
    <a-tabs v-model:activeKey="activeTab">
      <!-- 答题标签页 -->
      <a-tab-pane key="answer" tab="自动答题">
        <a-space direction="vertical" :size="16" style="width: 100%">
          <!-- 批改结果卡片 -->
          <a-card 
            v-if="examResult" 
            title="📊 批改结果" 
            size="small"
            :bordered="true"
          >
            <a-row :gutter="16">
              <a-col :span="8">
                <a-statistic 
                  title="正确" 
                  :value="examResult.correct"
                  :value-style="{ color: '#52c41a' }"
                  :suffix="'/' + examResult.total"
                />
              </a-col>
              <a-col :span="8">
                <a-statistic 
                  title="错误" 
                  :value="examResult.wrong"
                  :value-style="{ color: '#f5222d' }"
                  :suffix="'/' + examResult.total"
                />
              </a-col>
              <a-col :span="8">
                <a-statistic 
                  title="正确率" 
                  :value="examResult.accuracy"
                  suffix="%"
                  :value-style="{ color: examResult.accuracy >= 60 ? '#52c41a' : '#f5222d' }"
                />
              </a-col>
            </a-row>
            <a-divider style="margin: 12px 0" />
            <a-space>
              <a-tag v-if="examResult.uploaded > 0" color="success">
                💾 已上传 {{examResult.uploaded}} 道正确答案
              </a-tag>
              <a-button 
                v-if="examResult.wrong > 0" 
                type="link" 
                size="small"
                @click="startCorrection"
              >
                🔧 智能纠错({{examResult.wrong}})
              </a-button>
            </a-space>
          </a-card>

          <!-- 状态卡片 -->
          <a-card title="答题状态" size="small">
            <!-- 实时进度 -->
            <div v-if="isAnswering && realtimeProgress.current > 0" style="margin-bottom: 16px; padding: 12px; background: #f0f5ff; border-radius: 4px; border-left: 3px solid #1890ff;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 13px; font-weight: 500; color: #1890ff;">
                  🎯 正在答题: {{ realtimeProgress.current }} / {{ realtimeProgress.total }}
                </span>
                <a-tag color="processing">进行中</a-tag>
              </div>
              <div v-if="realtimeProgress.currentQuestionId" style="font-size: 12px; color: #666; margin-bottom: 4px;">
                <span style="font-weight: 500;">当前题目:</span> {{ realtimeProgress.currentQuestionId.substring(0, 8) }}...
              </div>
              <div v-if="realtimeProgress.currentContent" style="font-size: 12px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {{ realtimeProgress.currentContent }}
              </div>
            </div>

            <a-row :gutter="16">
              <a-col :span="8">
                <a-statistic title="总题数" :value="progress.total" />
              </a-col>
              <a-col :span="8">
                <a-statistic 
                  title="已完成" 
                  :value="progress.answered"
                  :value-style="{ color: '#3f8600' }"
                />
              </a-col>
              <a-col :span="8">
                <a-statistic 
                  title="成功率" 
                  :value="successRate"
                  suffix="%"
                  :precision="1"
                />
              </a-col>
            </a-row>
            
            <a-progress 
              :percent="progressPercent" 
              :status="progressStatus"
              style="margin-top: 16px"
            />
            
            <!-- 详细统计 -->
            <a-row :gutter="8" style="margin-top: 12px;">
              <a-col :span="8">
                <div style="text-align: center; font-size: 12px;">
                  <div style="color: #52c41a; font-weight: 500;">✓ {{ progress.success }}</div>
                  <div style="color: #999;">成功</div>
                </div>
              </a-col>
              <a-col :span="8">
                <div style="text-align: center; font-size: 12px;">
                  <div style="color: #f5222d; font-weight: 500;">✗ {{ progress.failed }}</div>
                  <div style="color: #999;">失败</div>
                </div>
              </a-col>
              <a-col :span="8">
                <div style="text-align: center; font-size: 12px;">
                  <div style="color: #faad14; font-weight: 500;">⊝ {{ progress.skipped }}</div>
                  <div style="color: #999;">跳过</div>
                </div>
              </a-col>
            </a-row>
          </a-card>

          <!-- 答题选项 -->
          <a-card title="答题选项" size="small">
            <a-form layout="vertical">
              <a-form-item label="答题模式">
                <a-radio-group v-model:value="answerOptions.mode">
                  <a-radio value="api">云端API</a-radio>
                  <a-radio value="ai">AI答题</a-radio>
                  <a-radio value="both">API + AI</a-radio>
                </a-radio-group>
              </a-form-item>

              <a-form-item>
                <a-checkbox v-model:checked="answerOptions.skipAnswered">
                  跳过已答题目
                </a-checkbox>
              </a-form-item>

              <a-form-item>
                <a-checkbox v-model:checked="answerOptions.autoSubmit">
                  答题后自动提交
                </a-checkbox>
              </a-form-item>

              <a-form-item>
                <a-checkbox v-model:checked="answerOptions.autoCorrection">
                  答题后自动纠错
                </a-checkbox>
              </a-form-item>

              <a-form-item label="纠错最大重试" v-if="answerOptions.autoCorrection">
                <a-input-number 
                  v-model:value="answerOptions.maxRetries"
                  :min="1"
                  :max="5"
                  style="width: 100%"
                />
              </a-form-item>
            </a-form>
          </a-card>

          <!-- 操作按钮 -->
          <a-space style="width: 100%" direction="vertical">
            <a-button 
              type="primary" 
              block
              :loading="isAnswering"
              :disabled="isAnswering"
              @click="startAutoAnswer"
            >
              <template #icon><PlayCircleOutlined /></template>
              {{ isAnswering ? '答题中...' : '开始答题' }}
            </a-button>
            
            <a-button 
              v-if="isAnswering"
              block
              danger
              @click="stopAutoAnswer"
            >
              停止
            </a-button>

            <a-button 
              v-if="examResult && examResult.wrong > 0"
              block
              type="dashed"
              :loading="isCorrecting"
              @click="startCorrection"
            >
              <template #icon><BulbOutlined /></template>
              {{ isCorrecting ? '纠错中...' : `智能纠错 (${examResult.wrong}道错题)` }}
            </a-button>

            <a-button 
              block
              @click="refreshExamResult"
              :loading="isRefreshing"
            >
              🔄 刷新批改结果
            </a-button>
          </a-space>
        </a-space>
      </a-tab-pane>

      <!-- 移除独立的纠错标签页，功能已整合到答题Tab -->
      <!-- <a-tab-pane key="correction" tab="智能纠错">
        <a-space direction="vertical" :size="16" style="width: 100%">
          <a-alert
            message="智能纠错"
            description="点击按钮自动拉取错题并进行纠错（仅针对客观题：单选、多选、判断、填空）"
            type="info"
            show-icon
          />

          <a-card title="纠错设置" size="small">
            <a-form layout="vertical">
              <a-form-item>
                <a-checkbox v-model:checked="correctionOptions.autoCorrect">
                  自动纠错
                </a-checkbox>
              </a-form-item>

              <a-form-item>
                <a-checkbox v-model:checked="correctionOptions.autoResubmit">
                  纠错后自动重新提交
                </a-checkbox>
              </a-form-item>

              <a-form-item label="最大重试次数">
                <a-input-number 
                  v-model:value="correctionOptions.maxRetries"
                  :min="1"
                  :max="5"
                  style="width: 100%"
                />
              </a-form-item>
            </a-form>
          </a-card>

          <a-button 
            type="primary" 
            block
            :loading="isCorrecting"
            @click="startCorrection"
          >
            <template #icon><BulbOutlined /></template>
            {{ isCorrecting ? '纠错中...' : '开始智能纠错' }}
          </a-button>
        </a-space>
      </a-tab-pane> -->

      <!-- 刷课标签页 -->
      <a-tab-pane key="course" tab="刷课">
        <a-space direction="vertical" :size="16" style="width: 100%">
          <!-- 状态卡片 -->
          <a-card title="刷课状态" size="small">
            <a-row :gutter="16">
              <a-col :span="8">
                <a-statistic 
                  title="视频完成" 
                  :value="courseStats.videosCompleted"
                  :value-style="{ color: '#3f8600' }"
                />
              </a-col>
              <a-col :span="8">
                <a-statistic 
                  title="习题完成" 
                  :value="courseStats.exercisesCompleted"
                  :value-style="{ color: '#1890ff' }"
                />
              </a-col>
              <a-col :span="8">
                <a-statistic 
                  title="运行状态" 
                  :value="isCourseRunning ? '运行中' : '已停止'"
                  :value-style="{ color: isCourseRunning ? '#52c41a' : '#999' }"
                />
              </a-col>
            </a-row>
          </a-card>

          <!-- 刷课设置 -->
          <a-card title="刷课设置" size="small">
            <a-space direction="vertical" :size="12" style="width: 100%">
              <div>
                <div style="margin-bottom: 8px;">
                  <span>播放速度: {{ courseSettings.playbackSpeed }}x</span>
                </div>
                <a-slider 
                  v-model:value="courseSettings.playbackSpeed" 
                  :min="1" 
                  :max="3" 
                  :step="0.5"
                  :marks="{ 1: '1x', 1.5: '1.5x', 2: '2x', 2.5: '2.5x', 3: '3x' }"
                />
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>一键完成（快进到结尾）</span>
                <a-switch v-model:checked="courseSettings.instantFinish" />
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>自动跳转下一节</span>
                <a-switch v-model:checked="courseSettings.autoNext" />
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>跳过已完成的课程</span>
                <a-switch v-model:checked="courseSettings.skipCompleted" />
              </div>
            </a-space>
          </a-card>

          <!-- 操作按钮 -->
          <a-space style="width: 100%">
            <a-button 
              type="primary" 
              :loading="isCourseRunning"
              @click="handleStartCourse"
              style="flex: 1"
            >
              <PlayCircleOutlined v-if="!isCourseRunning" />
              {{ isCourseRunning ? '刷课中...' : '开始刷课' }}
            </a-button>

            <a-button 
              danger
              :disabled="!isCourseRunning"
              @click="handleStopCourse"
              style="flex: 1"
            >
              <StopOutlined />
              停止刷课
            </a-button>
          </a-space>

          <a-alert
            message="使用说明"
            description="1. 默认按顺序播放所有课程，勾选'跳过已完成'可自动跳过进度为100%的课程。2. 一键完成模式会直接快进到视频结尾。3. 系统会自动播放视频、处理习题并跳转下一节。"
            type="info"
            show-icon
          />
        </a-space>
      </a-tab-pane>

      <!-- 错题记录标签页 -->
      <a-tab-pane key="errors" tab="错题记录">
        <ErrorListTab />
      </a-tab-pane>

      <!-- 设置标签页 -->
      <a-tab-pane key="settings" tab="设置">
        <a-space direction="vertical" :size="16" style="width: 100%">
          <a-card title="API设置" size="small">
            <a-form layout="vertical">
              <a-form-item label="API地址">
                <a-input 
                  v-model:value="settings.apiUrl"
                  placeholder="http://localhost:8000"
                />
              </a-form-item>

              <a-form-item label="API密钥">
                <a-input-password 
                  v-model:value="settings.apiKey"
                  placeholder="请输入API密钥"
                />
                <div style="font-size: 12px; color: #999; margin-top: 4px;">
                  需要配置后端API密钥才能使用云端答题服务
                </div>
              </a-form-item>

              <a-form-item label="AI模型">
                <a-radio-group 
                  v-model:value="settings.aiModel"
                  style="width: 100%"
                >
                  <a-radio-button value="deepseek-chat" style="width: 50%">
                    DeepSeek-V3
                  </a-radio-button>
                  <a-radio-button value="deepseek-reasoner" style="width: 50%">
                    DeepSeek-R1
                  </a-radio-button>
                </a-radio-group>
                <div style="font-size: 12px; color: #999; margin-top: 4px;">
                  V3: 快速响应 | R1: 深度思考
                </div>
              </a-form-item>
            </a-form>
          </a-card>

          <a-card title="性能设置" size="small">
            <a-form layout="vertical">
              <a-form-item label="并发请求数">
                <a-slider 
                  v-model:value="settings.concurrency"
                  :min="1"
                  :max="10"
                  :marks="{ 1: '1', 3: '3', 5: '5', 10: '10' }"
                />
              </a-form-item>

              <a-form-item label="答题延迟(毫秒)">
                <a-input-number 
                  v-model:value="settings.delay"
                  :min="0"
                  :max="5000"
                  :step="100"
                  style="width: 100%"
                />
              </a-form-item>
            </a-form>
          </a-card>

          <a-button 
            type="primary" 
            block
            @click="saveSettings"
          >
            保存设置
          </a-button>
        </a-space>
      </a-tab-pane>
    </a-tabs>
    
    <!-- 日志区域 - 紧凑折叠设计 -->
    <div class="log-viewer" v-if="showLogs" :class="{ 'log-expanded': isLogExpanded }" :style="{ height: isLogExpanded ? logHeight + 'px' : '36px' }">
      <!-- 可拖拽调整大小的控制条 -->
      <div v-if="isLogExpanded" class="log-resizer" @mousedown="startResize"></div>
      
      <div class="log-header">
        <!-- 第一行：标题和操作按钮 -->
        <div class="log-header-row">
          <div class="log-header-left" @click="toggleLogExpand">
            <span class="log-expand-icon">{{ isLogExpanded ? '▼' : '▶' }}</span>
            <span class="log-title"> 日志</span>
            <a-badge :count="logs.length" :overflow-count="999" style="margin-left: 8px" />
            <span v-if="!isLogExpanded" class="log-stats-compact">
              <span v-if="logStats.error > 0" style="color: #ff4d4f; margin-left: 8px;">✖{{ logStats.error }}</span>
              <span v-if="logStats.warn > 0" style="color: #faad14; margin-left: 8px;">⚠{{ logStats.warn }}</span>
            </span>
          </div>
          <a-space size="small">
            <a-button v-if="isLogExpanded" size="small" @click.stop="copyLogs" title="复制日志">
              <CopyOutlined />
            </a-button>
            <a-button v-if="isLogExpanded" size="small" @click.stop="exportLogs" title="导出日志">
              <DownloadOutlined />
            </a-button>
            <a-button v-if="isLogExpanded" size="small" @click.stop="clearLogs" title="清空日志">清空</a-button>
            <a-button size="small" @click.stop="showLogs = false" title="关闭日志">×</a-button>
          </a-space>
        </div>
        
        <!-- 第二行：过滤按钮组（展开时显示） -->
        <div v-if="isLogExpanded" class="log-toolbar">
          <a-radio-group 
            v-model:value="logFilter" 
            size="small"
            button-style="solid"
            @change="filterLogs"
            @click.stop
          >
            <a-radio-button value="all">全部</a-radio-button>
            <a-radio-button value="info">INFO</a-radio-button>
            <a-radio-button value="warn">WARN</a-radio-button>
            <a-radio-button value="error">ERROR</a-radio-button>
            <a-radio-button value="debug">DEBUG</a-radio-button>
          </a-radio-group>
        </div>
      </div>
      <div v-show="isLogExpanded" class="log-content" ref="logContainer">
        <div 
          v-for="(log, index) in filteredLogs" 
          :key="index"
          :class="['log-item', `log-${log.level}`]"
        >
          <span class="log-time">{{ log.time }}</span>
          <span class="log-level">[{{ log.level.toUpperCase() }}]</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="filteredLogs.length === 0" class="log-empty-mini">
          {{ logs.length === 0 ? '暂无日志' : '无匹配日志' }}
        </div>
      </div>
    </div>
    
    <!-- 日志快捷按钮 -->
    <div v-if="!showLogs" class="log-float-btn" @click="toggleLogs">
      <div class="log-float-icon">📝</div>
      <div v-if="logs.length > 0" class="log-float-badge">{{ logs.length }}</div>
      <div v-if="logStats.error > 0" class="log-float-error">!</div>
    </div>
  </a-drawer>

  <!-- 结果通知 -->
  <ResultDisplay
    v-if="showResult"
    :result="result"
    @close="showResult = false"
  />
  
  <!-- 纠错进度侧边栏 -->
  <CorrectionProgress
    :visible="showCorrectionProgress"
    :current-round="correctionRound"
    :max-rounds="correctionOptions.maxRetries"
    @close="showCorrectionProgress = false"
  />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  ThunderboltOutlined,
  PlayCircleOutlined,
  SendOutlined,
  SettingOutlined,
  BulbOutlined,
  CopyOutlined,
  DownloadOutlined,
  FilterOutlined,
  StopOutlined
} from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import ResultDisplay from './result-display.vue';
import ErrorListTab from './components/error-list-tab.vue';
import CorrectionProgress from './components/correction-progress.vue';
import AutoAnswer from '../modules/auto-answer.js';
import SubmitHandler from '../modules/submit-handler.js';
import CorrectionManager from '../modules/correction.js';
import CourseAuto from '../modules/course-auto.js';
import NetworkInterceptor from '../network/interceptor.js';
import Config from '../core/config.js';
import RequestQueue from '../network/request-queue.js';
import { logger } from '../core/utils.js';
import { throttle } from '../core/debounce.js';

// 状态
const drawerVisible = ref(false);
const showLogs = ref(false);
const logs = ref([]);
const logContainer = ref(null);
const logFilter = ref('all');
const isLogExpanded = ref(false);
const logHeight = ref(180);
const activeTab = ref('answer');
const isAnswering = ref(false);
const isCorrecting = ref(false);
const isRefreshing = ref(false);
const showResult = ref(false);
const result = ref(null);
const examResult = ref(null); // 批改结果
const showCorrectionProgress = ref(false); // 纠错进度侧边栏
const correctionRound = ref(1); // 当前纠错轮次

// 进度
const progress = ref({
  total: 0,
  answered: 0,
  success: 0,
  failed: 0,
  skipped: 0
});

// 实时进度（答题中）
const realtimeProgress = ref({
  current: 0,
  total: 0,
  currentQuestionId: null,
  currentContent: null
});

// 答题选项
const answerOptions = ref({
  mode: 'both',
  skipAnswered: true,
  autoSubmit: false,
  autoCorrection: false,  // 答题后自动纠错
  maxRetries: 3  // 纠错最大重试次数
});

// 纠错选项
const correctionOptions = ref({
  autoCorrect: true,
  autoResubmit: true,
  maxRetries: 3
});

// 设置
const settings = ref({
  apiUrl: Config.get('api.baseUrl', 'http://localhost:8000'),
  apiKey: Config.get('api.key', ''),
  aiModel: Config.get('ai.model', 'deepseek-chat'),
  concurrency: 3,
  delay: 500
});

// 刷课相关状态
const isCourseRunning = ref(false);
const courseSettings = ref({
  playbackSpeed: Config.get('course.playbackSpeed', 2.0),
  instantFinish: Config.get('course.instantFinish', false),
  autoNext: Config.get('course.autoNext', true),
  skipCompleted: Config.get('course.skipCompleted', false)
});
const courseStats = ref({
  videosCompleted: 0,
  exercisesCompleted: 0
});

// 创建刷课管理器实例
let courseAutoInstance = null;

// 计算属性
const successRate = computed(() => {
  if (progress.value.total === 0) return 0;
  return (progress.value.success / progress.value.total) * 100;
});

const progressPercent = computed(() => {
  if (progress.value.total === 0) return 0;
  return Math.round((progress.value.answered / progress.value.total) * 100);
});

const progressStatus = computed(() => {
  if (progress.value.total === 0) return 'normal';
  if (progress.value.answered === progress.value.total) return 'success';
  return 'active';
});

// 日志统计
const logStats = computed(() => {
  return {
    info: logs.value.filter(log => log.level === 'info').length,
    warn: logs.value.filter(log => log.level === 'warn').length,
    error: logs.value.filter(log => log.level === 'error').length,
    debug: logs.value.filter(log => log.level === 'debug').length
  };
});

// 过滤后的日志
const filteredLogs = computed(() => {
  if (logFilter.value === 'all') {
    return logs.value;
  }
  return logs.value.filter(log => log.level === logFilter.value);
});

// 方法
const handleOpenChange = (open) => {
  if (open) {
    updateProgress();
  }
};

const handleAutoAnswer = () => {
  drawerVisible.value = true;
  activeTab.value = 'answer';
};

const handleSubmit = async () => {
  const check = await SubmitHandler.checkSubmittable();
  
  // 有未答题
  if (!check.canSubmit) {
    Modal.confirm({
      title: '确认提交',
      content: `${check.reason}，确定要提交吗？`,
      onOk: async () => {
        await submitWork();
      }
    });
    return;
  }
  
  // 有多选题警告
  if (check.hasWarnings && check.issues && check.issues.length > 0) {
    const warningMsg = check.issues.map(issue => issue.message).join('\n');
    Modal.warning({
      title: '⚠️ 多选题检查',
      content: `检测到以下问题：\n\n${warningMsg}\n\n建议检查这些题目后再提交。\n确定要继续提交吗？`,
      okText: '继续提交',
      cancelText: '返回检查',
      onOk: async () => {
        await submitWork();
      }
    });
    return;
  }
  
  // 没有问题，直接提交
  await submitWork();
};

const handleSettings = () => {
  drawerVisible.value = true;
  activeTab.value = 'settings';
};

// 刷新批改结果
const refreshExamResult = async () => {
  if (isRefreshing.value) {
    return;
  }

  try {
    isRefreshing.value = true;
    
    // 调用公开的方法获取批改结果统计（会自动上传正确答案）
    const stats = await CorrectionManager.fetchExamStatistics();
    
    if (stats.total === 0) {
      message.info('暂无批改数据');
      examResult.value = null;
      return;
    }
    
    // 更新UI状态
    examResult.value = stats;
    
    // 显示成功消息
    const msg = `📊 批改结果：${stats.correct}/${stats.total} 正确 (${stats.accuracy}%)`;
    if (stats.uploaded > 0) {
      message.success(`${msg} | 💾 已上传 ${stats.uploaded} 道正确答案`);
    } else {
      message.success(msg);
    }
    
  } catch (error) {
    logger.error('[Panel] 刷新批改结果失败:', error);
    message.error('刷新失败: ' + error.message);
  } finally {
    isRefreshing.value = false;
  }
};

const startCorrection = async () => {
  if (isCorrecting.value) {
    return;
  }

  try {
    isCorrecting.value = true;
    correctionRound.value = 1;
    showCorrectionProgress.value = true; // 显示进度侧边栏
    message.loading('正在拉取错题...', 0);

    // 调用拉取并纠错方法
    const correctionResult = await CorrectionManager.fetchAndCorrect({
      maxRetries: correctionOptions.value.maxRetries,
      onRoundChange: (round) => {
        correctionRound.value = round; // 更新当前轮次
      }
    });

    message.destroy();

    // 没有错题
    if (correctionResult.total === 0) {
      message.success('✅ ' + (correctionResult.message || '没有错题，真棒！'));
      return;
    }
    
    // 全部成功
    if (correctionResult.failed === 0) {
      message.success(`✅ 纠错完成！成功: ${correctionResult.success}/${correctionResult.total}`);
      return;
    }
    
    // 部分成功
    if (correctionResult.success > 0) {
      const failedResults = correctionResult.results.filter(r => !r.success);
      let failedDetails = '';
      
      failedResults.forEach(r => {
        const attempts = r.attemptedAnswers?.join(', ') || '无';
        failedDetails += `\n- 题目 ${r.questionId}: [${attempts}]`;
      });
      
      Modal.warning({
        title: '纠错部分成功',
        content: `
          成功: ${correctionResult.success}/${correctionResult.total}\n
          失败: ${correctionResult.failed}/${correctionResult.total}\n
          尝试轮数: ${correctionResult.attempts}\n\n
          失败题目已尝试的答案:${failedDetails}\n\n
          建议: 请手动检查失败题目，可能需要特殊格式
        `,
        okText: '知道了'
      });
      return;
    }
    
    // 全部失败
    const failedResults = correctionResult.results.filter(r => !r.success);
    let failedDetails = '';
    
    failedResults.forEach(r => {
      const attempts = r.attemptedAnswers?.join(', ') || '无';
      failedDetails += `\n- 题目 ${r.questionId}: [${attempts}]`;
    });
    
    Modal.error({
      title: '纠错失败',
      content: `
        所有错题纠正都失败了！\n\n
        总计: ${correctionResult.total} 道\n
        尝试轮数: ${correctionResult.attempts}\n\n
        已尝试的答案:${failedDetails}\n\n
        建议: 请手动检查题目要求，可能需要特殊格式或存在其他问题
      `,
      okText: '知道了'
    });

  } catch (error) {
    message.destroy();
    message.error('纠错失败: ' + error.message);
  } finally {
    isCorrecting.value = false;
  }
};

// 进度更新回调（节流优化，避免频繁更新UI）
const handleProgressUpdate = throttle((progressData) => {
  const { type, current, total, questionId, questionContent, answer, reason, progress: progressStats } = progressData;
  
  // 更新实时进度
  realtimeProgress.value.current = current;
  realtimeProgress.value.total = total;
  realtimeProgress.value.currentQuestionId = questionId;
  realtimeProgress.value.currentContent = questionContent;
  
  // 更新统计数据
  if (progressStats) {
    progress.value.answered = progressStats.answered;
    progress.value.success = progressStats.success;
    progress.value.failed = progressStats.failed;
    progress.value.skipped = progressStats.skipped;
  }
  
  // 根据类型显示不同消息
  if (type === 'success') {
    logger.debug(`[Panel] ✓ 题目 ${questionId.substring(0, 8)}... 答题成功: ${answer}`);
  } else if (type === 'skip') {
    logger.debug(`[Panel] ⊝ 题目 ${questionId.substring(0, 8)}... 跳过: ${reason}`);
  }
}, 150); // 150ms节流，平衡性能和实时性

const startAutoAnswer = async () => {
  try {
    isAnswering.value = true;
    
    // 重置实时进度
    realtimeProgress.value = {
      current: 0,
      total: 0,
      currentQuestionId: null,
      currentContent: null
    };
    
    message.loading('开始自动答题...', 0);
    
    // 设置并发数
    RequestQueue.setConcurrencyLimit(settings.value.concurrency);
    
    // 开始答题（传递进度回调）
    const answerResult = await AutoAnswer.start({
      useAI: answerOptions.value.mode !== 'api',
      skipAnswered: answerOptions.value.skipAnswered,
      useQueue: true,
      delay: settings.value.delay,
      onProgress: handleProgressUpdate  // 传递节流后的回调
    });
    
    message.destroy();
    message.success(`答题完成！成功: ${answerResult.progress.success}题`);
    
    // 更新最终进度
    progress.value = answerResult.progress;
    
    // 清空实时进度
    realtimeProgress.value.current = 0;
    
    // 自动提交
    if (answerOptions.value.autoSubmit) {
      await submitWork();
    }
    
  } catch (error) {
    message.destroy();
    message.error('答题失败: ' + error.message);
  } finally {
    isAnswering.value = false;
  }
};

const stopAutoAnswer = () => {
  AutoAnswer.stop();
  isAnswering.value = false;
  message.info('已停止答题');
};

const submitWork = async () => {
  try {
    message.loading('提交中...', 0);
    
    const success = await SubmitHandler.submit({
      autoConfirm: true,
      waitResult: true
    });
    
    message.destroy();
    
    if (success) {
      message.success('提交成功！');
    } else {
      message.error('提交失败');
    }
    
  } catch (error) {
    message.destroy();
    message.error('提交失败: ' + error.message);
  }
};

const saveSettings = () => {
  Config.set('api.baseUrl', settings.value.apiUrl);
  Config.set('api.key', settings.value.apiKey);
  Config.set('ai.model', settings.value.aiModel);
  
  message.success('设置已保存');
};

const updateProgress = () => {
  const currentProgress = AutoAnswer.getProgress();
  progress.value = currentProgress;
};

// 刷课相关方法
const handleStartCourse = async () => {
  if (isCourseRunning.value) {
    message.warning('刷课已在运行中');
    return;
  }

  try {
    // 创建刷课管理器实例
    if (!courseAutoInstance) {
      courseAutoInstance = new CourseAuto();
    }

    // 更新配置
    courseAutoInstance.updateConfig({
      playbackSpeed: courseSettings.value.playbackSpeed,
      instantFinish: courseSettings.value.instantFinish,
      autoNext: courseSettings.value.autoNext,
      skipCompleted: courseSettings.value.skipCompleted
    });

    isCourseRunning.value = true;
    message.success('开始刷课...');
    logger.info('[UI] 开始刷课');

    // 启动刷课（异步执行）
    courseAutoInstance.start().then(() => {
      isCourseRunning.value = false;
      const stats = courseAutoInstance.getStats();
      courseStats.value = {
        videosCompleted: stats.videosCompleted,
        exercisesCompleted: stats.exercisesCompleted
      };
      message.success('刷课已完成！');
    }).catch((error) => {
      isCourseRunning.value = false;
      message.error('刷课失败: ' + error.message);
      logger.error('[UI] 刷课失败:', error);
    });

    // 定期更新统计信息
    const updateStatsInterval = setInterval(() => {
      if (!isCourseRunning.value) {
        clearInterval(updateStatsInterval);
        return;
      }
      const stats = courseAutoInstance.getStats();
      courseStats.value = {
        videosCompleted: stats.videosCompleted,
        exercisesCompleted: stats.exercisesCompleted
      };
    }, 1000);

  } catch (error) {
    isCourseRunning.value = false;
    message.error('启动刷课失败: ' + error.message);
    logger.error('[UI] 启动刷课失败:', error);
  }
};

const handleStopCourse = () => {
  if (!isCourseRunning.value) {
    message.warning('刷课未在运行中');
    return;
  }

  if (courseAutoInstance) {
    courseAutoInstance.stop();
    isCourseRunning.value = false;
    message.info('已停止刷课');
    logger.info('[UI] 已停止刷课');
  }
};

// 监听网络拦截器事件
const setupListeners = () => {
  NetworkInterceptor.on('errors-found', async (errors) => {
    if (correctionOptions.value.autoCorrect) {
      message.info(`发现${errors.length}道错题，开始智能纠错...`);
      
      const correctionResult = await CorrectionManager.correct(errors, {
        autoSubmit: correctionOptions.value.autoResubmit,
        maxRetries: correctionOptions.value.maxRetries
      });
      
      message.success(`纠错完成！成功: ${correctionResult.success}/${correctionResult.total}`);
    }
  });
};

// 拦截日志输出到面板
const interceptLogs = () => {
  const originalInfo = logger.info;
  const originalWarn = logger.warn;
  const originalError = logger.error;
  const originalDebug = logger.debug;
  
  logger.info = (...args) => {
    originalInfo(...args);
    addLog('info', args.join(' '));
  };
  
  logger.warn = (...args) => {
    originalWarn(...args);
    addLog('warn', args.join(' '));
  };
  
  logger.error = (...args) => {
    originalError(...args);
    addLog('error', args.join(' '));
  };
  
  logger.debug = (...args) => {
    originalDebug(...args);
    addLog('debug', args.join(' '));
  };
};

// 添加日志
const addLog = (level, message) => {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  logs.value.push({
    level,
    message,
    time,
    timestamp: Date.now()
  });
  
  // 限制日志数量，最多保留 500 条
  if (logs.value.length > 500) {
    logs.value.shift();
  }
  
  // 自动滚动到底部
  setTimeout(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  }, 10);
};

// 清空日志
const clearLogs = () => {
  logs.value = [];
  logFilter.value = 'all';
  message.success('日志已清空');
};

// 复制日志到剪贴板
const copyLogs = async () => {
  if (logs.value.length === 0) {
    message.warning('暂无日志');
    return;
  }
  
  try {
    const logsToUse = logFilter.value === 'all' ? logs.value : filteredLogs.value;
    const text = logsToUse.map(log => 
      `${log.time} [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    // 使用 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      message.success(`已复制 ${logsToUse.length} 条日志`);
    } else {
      // 兼容旧浏览器
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      message.success(`已复制 ${logsToUse.length} 条日志`);
    }
  } catch (error) {
    message.error('复制失败: ' + error.message);
  }
};

// 导出日志为文件
const exportLogs = () => {
  if (logs.value.length === 0) {
    message.warning('暂无日志');
    return;
  }
  
  try {
    const logsToUse = logFilter.value === 'all' ? logs.value : filteredLogs.value;
    const text = logsToUse.map(log => 
      `${log.time} [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const now = new Date();
    const filename = `lazy-sheep-logs-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.txt`;
    link.download = filename;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    message.success(`已导出 ${logsToUse.length} 条日志`);
  } catch (error) {
    message.error('导出失败: ' + error.message);
  }
};

// 过滤日志
const filterLogs = () => {
  // 滚动到顶部
  if (logContainer.value) {
    logContainer.value.scrollTop = 0;
  }
};

// 切换日志展开/收起
const toggleLogExpand = () => {
  isLogExpanded.value = !isLogExpanded.value;
};

// 切换日志显示
const toggleLogs = () => {
  showLogs.value = true;
  isLogExpanded.value = true;
};

// 调整日志面板大小
const startResize = (e) => {
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = logHeight.value;
  
  const onMouseMove = (moveEvent) => {
    const deltaY = startY - moveEvent.clientY;
    const newHeight = Math.max(120, Math.min(500, startHeight + deltaY));
    logHeight.value = newHeight;
  };
  
  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

// 加载设置
const loadSettings = () => {
  settings.value = {
    apiUrl: Config.get('api.baseUrl', 'http://localhost:8000'),
    apiKey: Config.get('api.key', ''),
    aiModel: Config.get('ai.model', 'deepseek-chat'),
    delay: Config.get('answer.delay', 500),
    concurrency: Config.get('queue.concurrency', 3)
  };
};

// 加载统计
const loadStatistics = () => {
  // 可以从 Config 或其他地方加载统计数据
  updateProgress();
};

// 处理发现错题事件
const handleErrorsFound = async (errors) => {
  if (correctionOptions.value.autoCorrect) {
    message.info(`发现${errors.length}道错题，开始智能纠错...`);
    
    const correctionResult = await CorrectionManager.correct(errors, {
      maxRetries: correctionOptions.value.maxRetries
    });
    
    message.success(`纠错完成！成功: ${correctionResult.success}/${correctionResult.total}`);
  }
};

onMounted(() => {
  loadSettings();
  loadStatistics();
  
  // 监听错题事件
  NetworkInterceptor.on('errors-found', handleErrorsFound);
  
  // 拦截日志输出
  interceptLogs();
  
  // 🔥 页面加载时自动拉取批改结果（仅在习题页面）
  setTimeout(async () => {
    try {
      // 判断是否为习题页面（writePaper/busywork）
      const isExercisePage = window.location.pathname.includes('/writePaper/busywork/');
      
      if (isExercisePage) {
        logger.info('[Panel] 检测到习题页面，自动拉取批改结果...');
        await refreshExamResult();
      }
    } catch (error) {
      logger.warn('[Panel] 自动拉取批改结果失败:', error);
    }
  }, 2000); // 延迟2秒，等待页面加载完成
});
</script>

<style scoped>
/* 日志查看器 - 紧凑可折叠设计 */
.log-viewer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 36px;
  background: #ffffff;
  border-top: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  z-index: 10;
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s;
  box-shadow: 0 -1px 4px rgba(0, 0, 0, 0.05);
}

.log-viewer.log-expanded {
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  border-top: 2px solid #1890ff;
}

/* 可拖拽调整大小的控制条 */
.log-resizer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  cursor: ns-resize;
  background: transparent;
  z-index: 100;
}

.log-resizer:hover {
  background: #1890ff;
}

.log-resizer::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 3px;
  background: #d9d9d9;
  border-radius: 2px;
}

.log-header {
  display: flex;
  flex-direction: column;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
  color: #333;
  user-select: none;
}

.log-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  min-height: 36px;
}

.log-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #ffffff;
  border-top: 1px solid #f0f0f0;
  gap: 12px;
}

.log-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  cursor: pointer;
  padding: 4px 8px;
  margin: -4px -8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.log-header-left:hover {
  background: #f0f0f0;
}

.log-expand-icon {
  font-size: 10px;
  color: #8c8c8c;
  transition: transform 0.3s;
  display: inline-block;
  width: 14px;
}

.log-title {
  font-weight: 600;
  font-size: 13px;
  color: #262626;
}

.log-stats-compact {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  background: #fff;
}

.log-item {
  display: flex;
  gap: 10px;
  padding: 6px 12px;
  border-radius: 4px;
  margin-bottom: 3px;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}

.log-item:hover {
  background: #f5f7fa;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  transform: translateX(2px);
}

.log-time {
  color: #8c8c8c;
  min-width: 70px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.log-level {
  min-width: 65px;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.log-message {
  flex: 1;
  word-break: break-word;
  color: #262626;
  line-height: 1.5;
}

/* 单选按钮组样式优化 */
:deep(.ant-radio-group) {
  display: flex;
}

:deep(.ant-radio-button-wrapper) {
  font-size: 12px;
  height: 24px;
  line-height: 22px;
  padding: 0 8px;
  border-color: #d9d9d9;
  transition: all 0.3s;
}

:deep(.ant-radio-button-wrapper:hover) {
  color: #1890ff;
  border-color: #1890ff;
}

:deep(.ant-radio-button-wrapper-checked) {
  background: #1890ff !important;
  border-color: #1890ff !important;
  color: white !important;
  box-shadow: 0 2px 4px rgba(24, 144, 255, 0.3);
}

:deep(.ant-radio-button-wrapper-checked:hover) {
  background: #40a9ff !important;
  border-color: #40a9ff !important;
}

.log-info {
  border-left-color: #52c41a;
}

.log-info .log-level {
  color: #52c41a;
  background: #f6ffed;
  padding: 2px 8px;
  border-radius: 3px;
}

.log-warn {
  background: #fffbf0;
  border-left-color: #faad14;
}

.log-warn .log-level {
  color: #fa8c16;
  background: #fff7e6;
  padding: 2px 8px;
  border-radius: 3px;
}

.log-warn:hover {
  background: #fff7e6;
}

.log-error {
  background: #fff2f0;
  border-left-color: #ff4d4f;
}

.log-error .log-level {
  color: #ff4d4f;
  background: #fff1f0;
  padding: 2px 8px;
  border-radius: 3px;
}

.log-error:hover {
  background: #ffe7e6;
}

.log-debug {
  border-left-color: #1890ff;
}

.log-debug .log-level {
  color: #1890ff;
  background: #e6f7ff;
  padding: 2px 8px;
  border-radius: 3px;
}

.log-empty-mini {
  text-align: center;
  color: #bfbfbf;
  padding: 40px 20px;
  font-size: 12px;
}

/* 浮动日志按钮 */
.log-float-btn {
  position: absolute;
  bottom: 12px;
  left: 12px;
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  border-radius: 50%;
  box-shadow: 0 2px 12px rgba(24, 144, 255, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 10;
}

.log-float-btn:hover {
  transform: scale(1.1) translateY(-2px);
  box-shadow: 0 4px 20px rgba(24, 144, 255, 0.5);
}

.log-float-btn:active {
  transform: scale(0.95);
}

.log-float-icon {
  font-size: 20px;
  filter: grayscale(1) brightness(2);
}

.log-float-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #52c41a;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.log-float-error {
  position: absolute;
  top: -2px;
  left: -2px;
  background: #ff4d4f;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  animation: pulse-error 1.5s ease-in-out infinite;
}

@keyframes pulse-error {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

/* 滚动条样式 - 白色主题 */
.log-content::-webkit-scrollbar {
  width: 6px;
}

.log-content::-webkit-scrollbar-track {
  background: #f5f5f5;
}

.log-content::-webkit-scrollbar-thumb {
  background: #d9d9d9;
  border-radius: 3px;
}

.log-content::-webkit-scrollbar-thumb:hover {
  background: #bfbfbf;
}

:deep(.ant-statistic-group) {
  display: flex;
  gap: 16px;
}

:deep(.ant-card-body) {
  padding: 12px;
}

:deep(.ant-form-item) {
  margin-bottom: 12px;
}
</style>
