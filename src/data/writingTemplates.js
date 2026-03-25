export const writingTemplates = [
    {
        id: 'ielts-task2',
        category: 'Academic',
        name: '雅思大作文 (IELTS Task 2)',
        description: '经典四段式结构，适用于观点论证题。',
        content: `# Topic: [Insert Topic Here]

## Introduction
People hold different views on whether [rephrase topic]. While some believe [viewpoint A], I argue that [viewpoint B].

## Body Paragraph 1
One key reason is that...
For example,...
This demonstrates that...

## Body Paragraph 2
Another important point is that...
In addition,...
As a result,...

## Conclusion
In conclusion, although [concession], I strongly believe that...`
    },
    {
        id: 'toefl-independent',
        category: 'Academic',
        name: '托福独立写作 (TOEFL Independent)',
        description: '五段式结构，强调逻辑连接与论据支持。',
        content: `# Topic: Do you agree or disagree?

## Introduction
The issue of whether [topic] remains controversial. In my view, [thesis]. I hold this opinion for two key reasons.

## Body Paragraph 1
First, [Reason 1].
My own experience shows that...

## Body Paragraph 2
Second, [Reason 2].
For instance,...

## Conclusion
In summary, I firmly support [thesis restatement] because [reason 1] and [reason 2].`
    },
    {
        id: 'cold-email',
        category: 'Business',
        name: '商务求职信 (Cold Email)',
        description: '专业简洁，强调价值与行动请求。',
        content: `Subject: Application for [Role Name] - [Your Name]

Dear Hiring Manager,

I am writing to express my interest in the [Role Name] position at [Company Name], as advertised on [Platform].

With a background in [Your Field] and [Number] years of experience in [Key Skill], I am confident that I can contribute to your team. In my previous role at [Previous Company], I successfully [Achievement].

I have attached my resume for your review. I would welcome the opportunity to discuss how my skills align with your needs.

Thank you for your time and consideration.

Best regards,
[Your Name]
[Your Phone Number]
[Your LinkedIn Profile]`
    },
    {
        id: 'daily-journal',
        category: 'Casual',
        name: '每日英文日记 (Daily Journal)',
        description: '记录生活点滴，练习日常表达。',
        content: `# Date: ${new Date().toLocaleDateString()}

## What Happened Today?
Today was a [adjective] day. I woke up at... and then...

## How Did I Feel?
I felt [emotion] because...

## One Thing I Learned
I realized that...

## Plan for Tomorrow
Tomorrow, I hope to...`
    }
];
