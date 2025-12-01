<!--
  懒羊羊自动化平台 - 错题列表Tab
  @author 懒羊羊
-->

<template>
  <a-space direction="vertical" :size="16" style="width: 100%">
    <!-- 统计卡片 -->
    <a-card title="📊 错题统计" size="small">
      <a-row :gutter="16">
        <a-col :span="6">
          <a-statistic 
            title="总计" 
            :value="stats.total"
            :value-style="{ color: '#1890ff' }"
          />
        </a-col>
        <a-col :span="6">
          <a-statistic 
            title="待纠错" 
            :value="stats.pending"
            :value-style="{ color: '#faad14' }"
          />
        </a-col>
        <a-col :span="6">
          <a-statistic 
            title="成功" 
            :value="stats.success"
            :value-style="{ color: '#52c41a' }"
          />
        </a-col>
        <a-col :span="6">
          <a-statistic 
            title="失败" 
            :value="stats.failed"
            :value-style="{ color: '#f5222d' }"
          />
        </a-col>
      </a-row>
      
      <!-- 按题型统计 -->
      <a-divider style="margin: 12px 0" />
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <a-tag v-for="(count, type) in stats.byType" :key="type" color="blue">
          {{type}}: {{count}}
        </a-tag>
      </div>
      
      <!-- 操作按钮 -->
      <a-divider style="margin: 12px 0" />
      <a-space>
        <a-button 
          type="primary" 
          size="small"
          @click="retryAll"
          :disabled="stats.failed === 0"
        >
          🔄 全部重试
        </a-button>
        <a-button 
          size="small"
          danger
          @click="clearAll"
        >
          🗑️ 清空记录
        </a-button>
      </a-space>
    </a-card>

    <!-- 错题列表 -->
    <div v-if="errors.length === 0">
      <a-empty description="暂无错题" />
    </div>
    
    <div v-else class="error-list">
      <a-card 
        v-for="error in errors" 
        :key="error.questionId"
        size="small"
        class="error-card"
        :class="'error-card-' + error.status"
      >
        <!-- 卡片头部 -->
        <template #title>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; font-weight: 500; color: #262626; margin-bottom: 4px;">
                {{ getQuestionTypeName(error.questionType) }}
              </div>
              <div style="font-size: 12px; color: #8c8c8c; font-family: monospace;">
                {{ error.questionId.substring(0, 12) }}...
              </div>
            </div>
            <a-tag :color="getStatusColor(error.status)" style="margin: 0;">
              {{ getStatusText(error.status) }}
            </a-tag>
          </div>
        </template>
        
        <!-- 卡片内容 -->
        <div class="error-content">
          <!-- 题目内容 -->
          <div class="content-section">
            <div class="section-label">题目内容</div>
            <div class="section-value" style="white-space: pre-wrap; word-break: break-word;">
              {{ error.content }}
            </div>
          </div>
          
          <!-- 选项 -->
          <div v-if="error.options && error.options.length > 0" class="content-section">
            <div class="section-label">选项</div>
            <div class="section-value">
              <div v-for="(opt, index) in error.options" :key="index" class="option-item">
                <span class="option-label">{{ String.fromCharCode(65 + index) }}.</span>
                <span style="word-break: break-word; white-space: pre-wrap;">{{ opt }}</span>
              </div>
            </div>
          </div>
          
          <!-- 错误答案 -->
          <div class="content-section">
            <div class="section-label">我的答案</div>
            <div class="section-value">
              <div style="color: #ff4d4f; font-size: 13px; line-height: 1.6; word-break: break-word;">
                {{ formatAnswer(error.wrongAnswer) }}
              </div>
            </div>
          </div>
          
          <!-- 已尝试答案 -->
          <div class="content-section">
            <div class="section-label">已尝试 ({{ error.attemptCount || 0 }}次)</div>
            <div class="section-value">
              <div v-if="error.attemptedAnswers.length > 0" style="display: flex; gap: 6px; flex-wrap: wrap;">
                <a-tag 
                  v-for="(ans, idx) in error.attemptedAnswers" 
                  :key="idx"
                  color="orange"
                  style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;"
                >
                  {{idx + 1}}. {{ formatAnswer(ans, 50) }}
                </a-tag>
              </div>
              <span v-else style="color: #bfbfbf; font-size: 12px;">暂无尝试</span>
            </div>
          </div>
          
          <!-- 最后更新 -->
          <div class="content-section" style="border-bottom: none; padding-bottom: 0;">
            <div class="section-label">最后更新</div>
            <div class="section-value" style="font-size: 12px; color: #8c8c8c;">
              {{ formatTime(error.lastAttemptTime) }}
            </div>
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <template #actions>
          <a-button 
            type="link" 
            size="small"
            @click="handleManualEdit(error)"
          >
            ✏️ 手动修改
          </a-button>
          <a-button 
            type="link"
            size="small"
            @click="handleRetry(error)"
            :disabled="error.status === 'retrying'"
          >
            🔄 重试
          </a-button>
          <a-button 
            type="link"
            size="small"
            danger
            @click="handleDelete(error)"
          >
            🗑️ 删除
          </a-button>
        </template>
      </a-card>
    </div>
  </a-space>
  
  <!-- 手动修改弹窗 -->
  <a-modal
    v-model:open="editModalVisible"
    title="手动修改答案"
    @ok="submitManualAnswer"
    @cancel="editModalVisible = false"
  >
    <a-form layout="vertical">
      <a-form-item label="题目">
        <div style="padding: 8px; background: #f5f5f5; border-radius: 4px;">
          {{ currentEditError?.content }}
        </div>
      </a-form-item>
      
      <a-form-item label="新答案">
        <a-input 
          v-model:value="manualAnswer"
          placeholder="请输入答案"
          @keyup.enter="submitManualAnswer"
        />
      </a-form-item>
      
      <a-alert
        message="提示"
        description="输入答案后将自动填充到页面，请确保答案格式正确"
        type="info"
        show-icon
      />
    </a-form>
  </a-modal>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { message, Modal } from 'ant-design-vue';
import ErrorTracker from '../../core/error-tracker.js';
import AnswerFiller from '../../modules/answer-filler.js';

// 状态
const stats = ref({
  total: 0,
  pending: 0,
  retrying: 0,
  success: 0,
  failed: 0,
  byType: {}
});

const errors = ref([]);
const editModalVisible = ref(false);
const currentEditError = ref(null);
const manualAnswer = ref('');

// 加载错题数据
const loadErrors = () => {
  stats.value = ErrorTracker.getStats();
  errors.value = ErrorTracker.getAll();
};

// 监听数据变化
const handleDataChange = (newStats, newErrors) => {
  stats.value = newStats;
  errors.value = newErrors;
};

onMounted(() => {
  loadErrors();
  ErrorTracker.addListener(handleDataChange);
});

onUnmounted(() => {
  ErrorTracker.removeListener(handleDataChange);
});

// 获取错题标题
const getErrorHeader = (error) => {
  const typeNames = {
    '0': '单选',
    '1': '多选',
    '2': '判断',
    '3': '填空',
    '4': '简答'
  };
  const typeName = typeNames[error.questionType] || '未知';
  const preview = error.content?.substring(0, 30) || '无内容';
  return `[${typeName}] ${preview}${error.content?.length > 30 ? '...' : ''}`;
};

// 获取状态颜色
const getStatusColor = (status) => {
  const colors = {
    pending: 'default',
    retrying: 'processing',
    success: 'success',
    failed: 'error'
  };
  return colors[status] || 'default';
};

// 清理并截断答案显示
const formatAnswer = (answer, maxLength = 100) => {
  if (!answer) return '未答';
  
  // 移除HTML标签
  const cleaned = answer.replace(/<[^>]+>/g, '').trim();
  
  // 截断过长内容
  if (cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength) + '...';
  }
  
  return cleaned;
};

// 获取状态文本
const getStatusText = (status) => {
  const texts = {
    pending: '待纠错',
    retrying: '纠错中',
    success: '已成功',
    failed: '已失败'
  };
  return texts[status] || status;
};

// 获取题型名称
const getQuestionTypeName = (type) => {
  const names = {
    '0': '单选题',
    '1': '多选题',
    '2': '判断题',
    '3': '填空题',
    '4': '简答题'
  };
  return names[type] || '未知题型';
};

// 格式化时间
const formatTime = (isoString) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 手动修改
const handleManualEdit = (error) => {
  currentEditError.value = error;
  manualAnswer.value = '';
  editModalVisible.value = true;
};

// 提交手动答案
const submitManualAnswer = async () => {
  if (!manualAnswer.value.trim()) {
    message.warning('请输入答案');
    return;
  }
  
  try {
    const error = currentEditError.value;
    const element = document.querySelector(`[data-id="${error.questionId}"]`);
    
    if (!element) {
      message.error('未找到题目元素，请刷新页面后重试');
      return;
    }
    
    // 填充答案
    const filled = await AnswerFiller.fill(element, manualAnswer.value, error.questionType);
    
    if (filled) {
      // 更新Tracker状态
      ErrorTracker.updateStatus(error.questionId, 'pending', manualAnswer.value);
      
      message.success('答案已填充，请提交验证结果');
      editModalVisible.value = false;
    } else {
      message.error('填充失败，请手动填写');
    }
  } catch (err) {
    message.error('操作失败: ' + err.message);
  }
};

// 再次尝试
const handleRetry = async (error) => {
  try {
    ErrorTracker.updateStatus(error.questionId, 'retrying');
    message.info('已标记为重试，请在答题Tab中启动纠错');
  } catch (err) {
    message.error('操作失败: ' + err.message);
  }
};

// 删除错题
const handleDelete = (error) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除这道错题吗？`,
    onOk: () => {
      ErrorTracker.remove(error.questionId);
      message.success('已删除');
    }
  });
};

// 全部重试
const retryAll = () => {
  const failed = errors.value.filter(e => e.status === 'failed');
  Modal.confirm({
    title: '确认全部重试',
    content: `将重新尝试 ${failed.length} 道失败的题目`,
    onOk: () => {
      failed.forEach(e => {
        ErrorTracker.updateStatus(e.questionId, 'pending');
      });
      message.success('已重置为待纠错状态');
    }
  });
};

// 清空所有错题
const clearAll = () => {
  Modal.confirm({
    title: '确认清空',
    content: '将清空所有错题记录，此操作不可恢复',
    okType: 'danger',
    onOk: () => {
      ErrorTracker.clear();
      message.success('已清空');
    }
  });
};
</script>

<style scoped>
.error-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.error-card {
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  transition: all 0.3s;
}

.error-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.error-card-pending {
  border-left: 3px solid #faad14;
}

.error-card-retrying {
  border-left: 3px solid #1890ff;
  background: #f0f7ff;
}

.error-card-success {
  border-left: 3px solid #52c41a;
  background: #f6ffed;
}

.error-card-failed {
  border-left: 3px solid #f5222d;
  background: #fff1f0;
}

.error-content {
  padding: 4px 0;
}

.content-section {
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.content-section:last-child {
  border-bottom: none;
}

.section-label {
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 6px;
  font-weight: 500;
}

.section-value {
  font-size: 13px;
  color: #262626;
  line-height: 1.6;
}

.option-item {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  line-height: 1.6;
}

.option-label {
  font-weight: 500;
  color: #1890ff;
  min-width: 20px;
}
</style>
