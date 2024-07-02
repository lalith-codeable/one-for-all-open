"use server";
import prisma from "@repo/db/client";
import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth";
import {
  createProblemSchema,
  deleteProblemSchema,
  updateProblemSchema,
} from "./schema";
import {
  InputTypeCreateProblem,
  InputTypeDeleteProblem,
  InputTypeUpdateProblem,
  ReturnTypeCreateProblem,
  ReturnTypeDeleteProblem,
  ReturnTypeUpdateProblem,
} from "./types";
import { createSafeAction } from "../../lib/createSafeAction";

async function validateUserAndTrack(userId: string, trackId: string) {
  const userDB = await prisma.user.findUnique({
    where: { id: userId },
    select: { collegeId: true, role: true },
  });
  if (!userDB?.collegeId || userDB.role === "user") {
    return { error: "Unauthorized or insufficient permissions" };
  }
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: { autherId: true },
  });
  if (!track || track.autherId !== userId) {
    return { error: "Unauthorized or insufficient permissions" };
  }
  return { success: true };
}

async function createProblemHandler(
  data: InputTypeCreateProblem
): Promise<ReturnTypeCreateProblem> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Unauthorized" };
    }

    const validation = await validateUserAndTrack(session.user.id, data.trackId);
    if ('error' in validation) {
      return validation;
    }

    const commonData = {
      title: data.title,
      trackId: data.trackId,
      description: data.description,
      notionDocId: data.notionDocId,
      problemType: data.type,
      sortingOrder: data.sortingOrder,
    };

    let problemData: any = { ...commonData };

    if (data.type !== "Blog") {
      problemData.QuizScore = {
        create: {
          score: data.score ?? 0,
          userId: session.user.id,
        },
      };
    }

    if (data.type === "Code") {
      problemData.problemStatement = {
        create: {
          programs: {
            createMany: {
              data: data.programs?.map((program) => ({
                boilerPlateCode: program.boilerPlateCode,
                mainCode: program.mainCode,
                correctCode: program.correctCode,
                codeLaungageId: program.languageId,
              })) ?? [],
            },
          },
          testCases: {
            createMany: {
              data: data.testCases?.map((testCase) => ({
                input: testCase.input,
                expectedOutput: testCase.expectedOutput,
                hidden: testCase.hidden,
              })) ?? [],
            },
          },
        },
      };
    } else if (data.type === "MCQ") {
      problemData.MCQQuestion = {
        create: {
          question: data.mcqQuestion?.question ?? "",
          options: data.mcqQuestion?.options ?? [],
          correctOption: data.mcqQuestion?.correctOption ?? "",
        },
      };
    }
    const createdProblem = await prisma.problem.create({
      data: problemData,
    });
    
    return { data: createdProblem };
  } catch (error: any) {
    console.error(error);
    return { error: error.message || "Failed to create problem" };
  }
}

async function updateProblemHandler(
  data: InputTypeUpdateProblem
): Promise<ReturnTypeUpdateProblem> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Unauthorized" };
    }

    const validation = await validateUserAndTrack(session.user.id, data.trackId!);
    if ('error' in validation) {
      return validation;
    }

    const updateData: any = {
      title: data.title,
      description: data.description,
      notionDocId: data.notionDocId,
      problemType: data.type,
      sortingOrder: data.sortingOrder,
    };

    if (data.type !== "Blog") {
      updateData.QuizScore = {
        upsert: {
          create: { score: data.score ?? 0, userId: session.user.id },
          update: { score: data.score },
        },
      };
    }

    if (data.type === "Code") {
      updateData.problemStatement = {
        upsert: {
          create: {
            programs: { createMany: { data: data.programs ?? [] } },
            testCases: { createMany: { data: data.testCases ?? [] } },
          },
          update: {
            programs: {
              deleteMany: {},
              createMany: { data: data.programs ?? [] },
            },
            testCases: {
              deleteMany: {},
              createMany: { data: data.testCases ?? [] },
            },
          },
        },
      };
    } else if (data.type === "MCQ") {
      updateData.MCQQuestion = {
        upsert: {
          create: {
            question: data.mcqQuestion?.question ?? "",
            options: data.mcqQuestion?.options ?? [],
            correctOption: data.mcqQuestion?.correctOption ?? "",
          },
          update: {
            question: data.mcqQuestion?.question,
            options: data.mcqQuestion?.options,
            correctOption: data.mcqQuestion?.correctOption,
          },
        },
      };
    }

    const updatedProblem = await prisma.problem.update({
      where: { id: data.id },
      data: updateData,
    });

    return { data: updatedProblem };
  } catch (error: any) {
    console.error(error);
    return { error: error.message || "Failed to update problem" };
  }
}

async function deleteProblemHandler(
  data: InputTypeDeleteProblem
): Promise<ReturnTypeDeleteProblem> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Unauthorized" };
    }

    const validation = await validateUserAndTrack(session.user.id, data.trackId);
    if ('error' in validation) {
      return validation;
    }

    const deletedProblem = await prisma.problem.delete({
      where: { id: data.id },
    });

    return { data: deletedProblem };
  } catch (error: any) {
    console.error(error);
    return { error: error.message || "Failed to delete problem" };
  }
}

export const getAllCourses = async () => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Unauthorized" };
    }

    const userDb = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { collegeId: true },
    });

    if (!userDb?.collegeId) {
      return { error: "Unauthorized" };
    }

    const courses = await prisma.course.findMany({
      where: {
        colleges: { some: { id: userDb.collegeId } },
      },
    });

    return { data: courses };
  } catch (error: any) {
    console.error(error);
    return { error: "Unable to Fetch Courses" };
  }
};

export const getAllProblems = async (id: string) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: "Unauthorized" };
    }

    const userDb = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { collegeId: true, semister: true },
    });

    if (!userDb?.collegeId || !userDb.semister) {
      return { error: "Unauthorized" };
    }

    const problems = await prisma.problem.findMany({
      where: {
        track: {
          id,
          collegeId: userDb.collegeId,
          semister: userDb.semister,
        },
      },
      include: {
        problemStatement: {
          include: {
            programs: true,
            testCases: { where: { hidden: false } },
          },
        },
        MCQQuestion: true,
        QuizScore: true,
      },
    });

    return { data: problems };
  } catch (error: any) {
    console.error(error);
    return { error: "Unable to Fetch Problems" };
  }
};

export const getAllCodeLanguage = async () => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return { error: "Unauthorized" };
    }

    const codeLanguages = await prisma.codeLanguage.findMany();
    return { data: codeLanguages };
  } catch (error: any) {
    console.error(error);
    return { error: "Failed to get all languages" };
  }
};

export const createProblem = createSafeAction(createProblemSchema, createProblemHandler);
export const updateProblem = createSafeAction(updateProblemSchema, updateProblemHandler);
export const deleteProblem = createSafeAction(deleteProblemSchema, deleteProblemHandler);