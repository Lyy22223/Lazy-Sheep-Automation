<!--
  懒羊羊自动化平台 - 结果展示组件
  @author 懒羊羊
-->

<template>
  <a-modal
    v-model:open="visible"
    title="答题结果"
    :footer="null"
    :width="600"
    @cancel="handleClose"
  >
    <a-result
      :status="resultStatus"
      :title="resultTitle"
      :sub-title="resultSubTitle"
    >
      <template #extra>
        <a-space direction="vertical" :size="16" style="width: 100%">
          <!-- 统计卡片 -->
          <a-card size="small">
            <a-descriptions bordered :column="2">
              <a-descriptions-item label="总题数">
                {{ result.total }}
              </a-descriptions-item>
              <a-descriptions-item label="已完成">
                <a-tag color="green">{{ result.answered }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="成功">
                <a-tag color="success">{{ result.success }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="失败">
                <a-tag color="error">{{ result.failed }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="跳过">
                <a-tag color="warning">{{ result.skipped }}</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="成功率">
                <a-tag :color="successRateColor">
                  {{ successRate }}%
                </a-tag>
              </a-descriptions-item>
            </a-descriptions>
          </a-card>

          <!-- 详细结果列表 -->
          <a-collapse v-if="result.results && result.results.length > 0">
            <a-collapse-panel key="details" header="查看详细结果">
              <a-list
                size="small"
                :data-source="result.results"
                :pagination="{ pageSize: 10 }"
              >
                <template #renderItem="{ item }">
                  <a-list-item>
                    <a-list-item-meta>
                      <template #title>
                        题目 ID: {{ item.questionId }}
                      </template>
                      <template #description>
                        <a-space>
                          <a-tag :color="getStatusColor(item.status)">
                            {{ getStatusText(item.status) }}
                          </a-tag>
                          <span v-if="item.answer">
                            答案: {{ item.answer }}
                          </span>
                          <span v-if="item.reason" style="color: #999">
                            {{ item.reason }}
                          </span>
                        </a-space>
                      </template>
                    </a-list-item-meta>
                  </a-list-item>
                </template>
              </a-list>
            </a-collapse-panel>
          </a-collapse>

          <!-- 操作按钮 -->
          <a-space style="width: 100%; justify-content: center">
            <a-button type="primary" @click="handleClose">
              确定
            </a-button>
            <a-button @click="handleExport">
              导出结果
            </a-button>
          </a-space>
        </a-space>
      </template>
    </a-result>
  </a-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { message } from 'ant-design-vue';

const props = defineProps({
  result: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['close']);

const visible = ref(true);

// 计算属性
const successRate = computed(() => {
  if (!props.result || props.result.total === 0) return 0;
  return Math.round((props.result.success / props.result.total) * 100);
});

const successRateColor = computed(() => {
  const rate = successRate.value;
  if (rate >= 90) return 'success';
  if (rate >= 70) return 'processing';
  if (rate >= 50) return 'warning';
  return 'error';
});

const resultStatus = computed(() => {
  const rate = successRate.value;
  if (rate >= 90) return 'success';
  if (rate >= 50) return 'warning';
  return 'error';
});

const resultTitle = computed(() => {
  const rate = successRate.value;
  if (rate === 100) return '完美！全部答对';
  if (rate >= 90) return '优秀！';
  if (rate >= 70) return '良好';
  if (rate >= 50) return '及格';
  return '需要改进';
});

const resultSubTitle = computed(() => {
  return `共${props.result.total}题，成功${props.result.success}题，成功率${successRate.value}%`;
});

// 方法
const getStatusColor = (status) => {
  const colors = {
    success: 'success',
    failed: 'error',
    skipped: 'warning',
    error: 'error'
  };
  return colors[status] || 'default';
};

const getStatusText = (status) => {
  const texts = {
    success: '成功',
    failed: '失败',
    skipped: '跳过',
    error: '错误'
  };
  return texts[status] || status;
};

const handleClose = () => {
  visible.value = false;
  emit('close');
};

const handleExport = () => {
  try {
    const data = JSON.stringify(props.result, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `答题结果_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    message.success('导出成功');
  } catch (error) {
    message.error('导出失败: ' + error.message);
  }
};

// 监听props变化
watch(() => props.result, () => {
  visible.value = true;
});
</script>

<style scoped>
:deep(.ant-result) {
  padding: 24px 0;
}

:deep(.ant-list-item) {
  padding: 8px 12px;
}
</style>
