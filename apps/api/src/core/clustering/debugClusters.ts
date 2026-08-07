import { prisma } from '../../shared/lib/prismaClient';

async function main() {
  const clusters = await prisma.cluster.findMany({
    include: {
      articleLinks: {
        include: {
          article: {
            select: {
              title: true,
              summary: true,
              url: true,
              source: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const result = clusters
    .map((cluster) => ({
      humanId: cluster.humanId,
      title: cluster.title,
      articleCount: cluster.articleLinks.length,
      articles: cluster.articleLinks.map((link) => ({
        source: link.article.source.name,
        title: link.article.title,
        summary: link.article.summary,
        url: link.article.url,
      })),
    }))
    .filter((cluster) => cluster.articleCount > 1)
    .sort((a, b) => b.articleCount - a.articleCount)
    .slice(0, 80);

  console.dir(result, { depth: null });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });