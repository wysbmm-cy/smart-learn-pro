export const writingTemplates = [
    {
        id: 'ielts-task2',
        category: 'Academic',
        name: '雅思大作文 (IELTS Task 2)',
        description: '经典的四段式议论文结构，适用于观点阐述类题目。',
        content: `# Topic: [Insert Topic Here]

## Introduction
People have differing views with regard to the question of whether [rephrase topic]. While some argue that [viewpoint A], I believe that [viewpoint B].

## Body Paragraph 1
On the one hand, it is arguable that...
For example,...
However,...

## Body Paragraph 2
On the other hand, I would argue that...
This is because...
Furthermore,...

## Conclusion
In conclusion, although [concession], I firmly believe that...`
    },
    {
        id: 'toefl-independent',
        category: 'Academic',
        name: '托福独立写作 (TOEFL Independent)',
        description: '五段式结构，强强调逻辑连接与论据支撑。',
        content: `# Topic: Do you agree or disagree?

## Introduction
The question of whether [topic] has been a subject of debate. In my opinion, [thesis statement]. I feel this way for two main reasons, which I will explore in the following essay.

## Body Paragraph 1
First of all, [Reason 1].
My personal experience demonstrates this reality.
Therefore,...

## Body Paragraph 2
Secondly, [Reason 2].
For instance,...
This clearly shows that...

## Conclusion
In conclusion, I strongly believe that [thesis restatement]. This is because [summary of reason 1] and [summary of reason 2].`
    },
    {
        id: 'cold-email',
        category: 'Business',
        name: '商务求职信 (Cold Email)',
        description: '专业的求职/套磁邮件，简洁有力。',
        content: `Subject: Application for [Role Name] - [Your Name]

Dear Hiring Manager,

I am writing to express my interest in the [Role Name] position at [Company Name], as advertised on [Platform].

With a solid background in [Your Field] and [Number] years of experience in [Key Skill], I am confident in my ability to contribute to your team. In my previous role at [Previous Company], I successfully [Achievement 1].

I have attached my resume for your review. I would welcome the opportunity to discuss how my skills align with [Company Name]'s needs.

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
