<!--
  懒羊羊自动化平台 - 纠错进度侧边栏
  @author 懒羊羊
-->

<template>
  <div v-if="visible" class="correction-progress-sidebar">
    <div class="progress-header">
      <span class="progress-title">📊 纠错进度</span>
      <a-button type="text" size="small" @click="$emit('close')">✕</a-button>
    </div>
    
    <div class="progress-content">
      <!-- 当前轮次 -->
      <div class="progress-section">
        <div class="section-title">当前轮次</div>
        <div class="round-info">
          <a-tag color="blue" style="font-size: 16px;">
            第 {{ currentRound }} / {{ maxRounds }} 轮
          </a-tag>
        </div>
      </div>
      
      <!-- 整体进度 -->
      <div class="progress-section">
        <div class="section-title">整体进度</div>
        <a-progress 
          :percent="overallPercent" 
          :status="overallStatus"
          :stroke-color="{
            '0%': '#108ee9',
            '100%': '#87d068',
          }"
        />
        <div class="stats-row">
          <span>总计: {{ stats.total }}</span>
          <span>已处理: {{ stats.processed }}</span>
        </div>
      </div>
      
      <!-- 成功题目 -->
      <div class="progress-section success-section">
        <div class="section-header">
          <span class="section-title">✅ 已纠正 ({{ stats.success }})</span>
          <a-button 
            v-if="stats.success > 0"
            type="link" 
            size="small"
            @click="toggleSuccess"
          >
            {{ showSuccess ? '收起' : '展开' }}
          </a-button>
        </div>
        <div v-if="showSuccess && successQuestions.length > 0" class="question-list">
          <div 
            v-for="q in successQuestions" 
            :key="q.questionId"
            class="question-item success-item"
          >
            <div class="question-id">{{ q.questionId.substring(0, 8) }}...</div>
            <div class="question-answer">
              <a-tag color="success">{{ q.answer }}</a-tag>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 纠错中 -->
      <div class="progress-section retrying-section">
        <div class="section-header">
          <span class="section-title">⏳ 纠错中 ({{ stats.retrying }})</span>
        </div>
        <div v-if="retryingQuestions.length > 0" class="question-list">
          <div 
            v-for="q in retryingQuestions" 
            :key="q.questionId"
            class="question-item retrying-item"
          >
            <div class="question-id">{{ q.questionId.substring(0, 8) }}...</div>
            <div class="question-meta">
              <a-tag color="processing">
                第{{ q.attemptCount }}次
              </a-tag>
              <a-spin size="small" />
            </div>
          </div>
        </div>
      </div>
      
      <!-- 失败题目 -->
      <div class="progress-section failed-section">
        <div class="section-header">
          <span class="section-title">❌ 失败 ({{ stats.failed }})</span>
          <a-button 
            v-if="stats.failed > 0"
            type="link" 
            size="small"
            @click="toggleFailed"
          >
            {{ showFailed ? '收起' : '展开' }}
          </a-button>
        </div>
        <div v-if="showFailed && failedQuestions.length > 0" class="question-list">
          <div 
            v-for="q in failedQuestions" 
            :key="q.questionId"
            class="question-item failed-item"
          >
            <div class="question-id">{{ q.questionId.substring(0, 8) }}...</div>
            <div class="question-attempts">
              <a-tooltip>
                <template #title>
                  <div>已尝试:</div>
                  <div v-for="(ans, idx) in q.attemptedAnswers" :key="idx">
                    {{ idx + 1 }}. {{ ans }}
                  </div>
                </template>
                <a-tag color="error">{{ q.attemptCount }}次</a-tag>
              </a-tooltip>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import ErrorTracker from '../../core/error-tracker.js';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  currentRound: {
    type: Number,
    default: 1
  },
  maxRounds: {
    type: Number,
    default: 3
  }
});

const emit = defineEmits(['close']);

// 展开/收起状态
const showSuccess = ref(false);
const showFailed = ref(true);

// 统计数据
const stats = ref({
  total: 0,
  processed: 0,
  success: 0,
  retrying: 0,
  failed: 0
});

// 题目列表
const successQuestions = ref([]);
const retryingQuestions = ref([]);
const failedQuestions = ref([]);

// 计算属性
const overallPercent = computed(() => {
  if (stats.value.total === 0) return 0;
  return Math.round((stats.value.processed / stats.value.total) * 100);
});

const overallStatus = computed(() => {
  if (stats.value.total === 0) return 'normal';
  if (stats.value.processed === stats.value.total) {
    return stats.value.failed > 0 ? 'exception' : 'success';
  }
  return 'active';
});

// 加载数据
const loadData = () => {
  const allErrors = ErrorTracker.getAll();
  
  stats.value = {
    total: allErrors.length,
    processed: allErrors.filter(e => e.status !== 'pending').length,
    success: allErrors.filter(e => e.status === 'success').length,
    retrying: allErrors.filter(e => e.status === 'retrying').length,
    failed: allErrors.filter(e => e.status === 'failed').length
  };
  
  successQuestions.value = allErrors
    .filter(e => e.status === 'success')
    .map(e => ({
      questionId: e.questionId,
      answer: e.attemptedAnswers[e.attemptedAnswers.length - 1] || '未知'
    }));
  
  retryingQuestions.value = allErrors
    .filter(e => e.status === 'retrying')
    .map(e => ({
      questionId: e.questionId,
      attemptCount: e.attemptCount || 0
    }));
  
  failedQuestions.value = allErrors
    .filter(e => e.status === 'failed')
    .map(e => ({
      questionId: e.questionId,
      attemptCount: e.attemptCount || 0,
      attemptedAnswers: e.attemptedAnswers || []
    }));
};

// 监听数据变化
const handleDataChange = () => {
  loadData();
};

onMounted(() => {
  loadData();
  ErrorTracker.addListener(handleDataChange);
});

onUnmounted(() => {
  ErrorTracker.removeListener(handleDataChange);
});

// 切换展开状态
const toggleSuccess = () => {
  showSuccess.value = !showSuccess.value;
};

const toggleFailed = () => {
  showFailed.value = !showFailed.value;
};
</script>

<style scoped>
.correction-progress-sidebar {
  position: fixed;
  right: 440px;
  top: 50%;
  transform: translateY(-50%);
  width: 280px;
  max-height: 80vh;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.progress-title {
  font-size: 14px;
  font-weight: 500;
}

.progress-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
}

.progress-section {
  margin-bottom: 16px;
}

.section-title {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.round-info {
  text-align: center;
  padding: 8px 0;
}

.stats-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
  margin-top: 8px;
}

.question-list {
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  padding: 4px;
}

.question-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: 4px;
  font-size: 12px;
}

.success-item {
  background: #f6ffed;
  border: 1px solid #b7eb8f;
}

.retrying-item {
  background: #e6f7ff;
  border: 1px solid #91d5ff;
}

.failed-item {
  background: #fff1f0;
  border: 1px solid #ffccc7;
}

.question-id {
  flex: 1;
  color: #666;
  font-family: monospace;
}

.question-answer,
.question-meta,
.question-attempts {
  display: flex;
  gap: 4px;
  align-items: center;
}

.success-section {
  border-left: 3px solid #52c41a;
  padding-left: 12px;
}

.retrying-section {
  border-left: 3px solid #1890ff;
  padding-left: 12px;
}

.failed-section {
  border-left: 3px solid #f5222d;
  padding-left: 12px;
}

/* 滚动条样式 */
.progress-content::-webkit-scrollbar,
.question-list::-webkit-scrollbar {
  width: 6px;
}

.progress-content::-webkit-scrollbar-thumb,
.question-list::-webkit-scrollbar-thumb {
  background: #ddd;
  border-radius: 3px;
}

.progress-content::-webkit-scrollbar-thumb:hover,
.question-list::-webkit-scrollbar-thumb:hover {
  background: #bbb;
}
</style>
