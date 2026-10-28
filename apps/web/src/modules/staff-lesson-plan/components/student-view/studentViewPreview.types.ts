export type StudentPreviewFrame = {
  mode: 'src' | 'srcdoc' | 'none';
  value: string;
};

export type StudentPreviewResource = {
  id: number;
  title: string;
  resourceType: string;
  summary: string | null;
  externalUrl: string | null;
};

export type StudentPreviewTask = {
  key: string;
  id: number | null;
  title: string;
  taskType: string;
  submissionScope: string;
  description: string;
  isRequired: boolean;
  topic: string;
  resources: StudentPreviewResource[];
  frames: {
    web: StudentPreviewFrame;
    submit: StudentPreviewFrame;
    visualization: StudentPreviewFrame;
  };
};

export type StudentPreviewPlan = {
  title: string;
  content: string;
  bookTitle: string;
  unitTitle: string;
  lessonTitle: string;
  assignedDate: string;
  tasks: StudentPreviewTask[];
};

export type StudentPreviewDevice = 'desktop' | 'tablet' | 'phone';
