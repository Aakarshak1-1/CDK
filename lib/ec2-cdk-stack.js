"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ec2CdkStack = void 0;
const cdk = require("aws-cdk-lib");
const fs_1 = require("fs");
const aws_ec2_1 = require("aws-cdk-lib/aws-ec2");
const aws_iam_1 = require("aws-cdk-lib/aws-iam");
const aws_codepipeline_1 = require("aws-cdk-lib/aws-codepipeline");
const aws_codepipeline_actions_1 = require("aws-cdk-lib/aws-codepipeline-actions");
const aws_codebuild_1 = require("aws-cdk-lib/aws-codebuild");
const aws_codedeploy_1 = require("aws-cdk-lib/aws-codedeploy");
const aws_cdk_lib_1 = require("aws-cdk-lib");
class Ec2CdkStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // IAM
        // Policy for CodeDeploy bucket access
        // Role that will be attached to the EC2 instance so it can be 
        // managed by AWS SSM
        const webServerRole = new aws_iam_1.Role(this, "ec2Role", {
            assumedBy: new aws_iam_1.ServicePrincipal("ec2.amazonaws.com"),
        });
        // IAM policy attachment to allow access to
        webServerRole.addManagedPolicy(aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));
        webServerRole.addManagedPolicy(aws_iam_1.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonEC2RoleforAWSCodeDeploy"));
        // VPC
        // This VPC has 3 public subnets, and that's it
        const vpc = new aws_ec2_1.Vpc(this, 'main_vpc', {
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'pub01',
                    subnetType: aws_ec2_1.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'pub02',
                    subnetType: aws_ec2_1.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'pub03',
                    subnetType: aws_ec2_1.SubnetType.PUBLIC,
                }
            ]
        });
        // Security Groups
        // This SG will only allow HTTP traffic to the Web server
        const webSg = new aws_ec2_1.SecurityGroup(this, 'web_sg', {
            vpc,
            description: "Allows Inbound HTTP traffic to the web server.",
            allowAllOutbound: true,
        });
        webSg.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(80));
        // EC2 Instance
        // This is the Python Web server that we will be using
        // Get the latest AmazonLinux 2 AMI for the given region
        const ami = new aws_ec2_1.AmazonLinuxImage({
            generation: aws_ec2_1.AmazonLinuxGeneration.AMAZON_LINUX_2023,
            cpuType: aws_ec2_1.AmazonLinuxCpuType.X86_64,
        });
        // The actual Web EC2 Instance for the web server
        const webServer = new aws_ec2_1.Instance(this, 'web_server', {
            vpc,
            instanceType: aws_ec2_1.InstanceType.of(aws_ec2_1.InstanceClass.T3, aws_ec2_1.InstanceSize.MICRO),
            machineImage: ami,
            securityGroup: webSg,
            role: webServerRole,
        });
        // User data - used for bootstrapping
        const webSGUserData = (0, fs_1.readFileSync)('./assets/configure_amz_linux_sample_app.sh', 'utf-8');
        webServer.addUserData(webSGUserData);
        // Tag the instance
        cdk.Tags.of(webServer).add('application-name', 'python-web');
        cdk.Tags.of(webServer).add('stage', 'prod');
        // Pipeline stuff
        // CodePipeline
        const pipeline = new aws_codepipeline_1.Pipeline(this, 'python_web_pipeline', {
            pipelineName: 'python-webApp',
            crossAccountKeys: false, // solves the encrypted bucket issue
        });
        // STAGES
        // Source Stage
        const sourceStage = pipeline.addStage({
            stageName: 'Source',
        });
        // Build Stage
        const buildStage = pipeline.addStage({
            stageName: 'Build',
        });
        // Deploy Stage
        const deployStage = pipeline.addStage({
            stageName: 'Deploy',
        });
        // Add some action
        // Source action
        const sourceOutput = new aws_codepipeline_1.Artifact();
        const githubSourceAction = new aws_codepipeline_actions_1.GitHubSourceAction({
            actionName: 'GithubSource',
            oauthToken: aws_cdk_lib_1.SecretValue.secretsManager('github-oauth-token'), // SET UP BEFORE
            owner: 'Aakarshak-TNM', // THIS NEEDS TO BE CHANGED TO THE READER
            repo: 'sample-python-web-app',
            branch: 'main',
            output: sourceOutput,
        });
        sourceStage.addAction(githubSourceAction);
        // Build Action
        const pythonTestProject = new aws_codebuild_1.PipelineProject(this, 'pythonTestProject', {
            environment: {
                buildImage: aws_codebuild_1.LinuxBuildImage.AMAZON_LINUX_2_5
            }
        });
        const pythonTestOutput = new aws_codepipeline_1.Artifact();
        const pythonTestAction = new aws_codepipeline_actions_1.CodeBuildAction({
            actionName: 'TestPython',
            project: pythonTestProject,
            input: sourceOutput,
            outputs: [pythonTestOutput]
        });
        buildStage.addAction(pythonTestAction);
        // Deploy Actions
        const pythonDeployApplication = new aws_codedeploy_1.ServerApplication(this, "python_deploy_application", {
            applicationName: 'python-webApp'
        });
        // Deployment group
        const pythonServerDeploymentGroup = new aws_codedeploy_1.ServerDeploymentGroup(this, 'PythonAppDeployGroup', {
            application: pythonDeployApplication,
            deploymentGroupName: 'PythonAppDeploymentGroup',
            installAgent: true,
            ec2InstanceTags: new aws_codedeploy_1.InstanceTagSet({
                'application-name': ['python-web'],
                'stage': ['prod', 'stage']
            })
        });
        // Deployment action
        const pythonDeployAction = new aws_codepipeline_actions_1.CodeDeployServerDeployAction({
            actionName: 'PythonAppDeployment',
            input: sourceOutput,
            deploymentGroup: pythonServerDeploymentGroup,
        });
        deployStage.addAction(pythonDeployAction);
        // Output the public IP address of the EC2 instance
        new cdk.CfnOutput(this, "IP Address", {
            value: webServer.instancePublicIp,
        });
    }
}
exports.Ec2CdkStack = Ec2CdkStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWMyLWNkay1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVjMi1jZGstc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLDJCQUFrQztBQUdsQyxpREFHNkI7QUFFN0IsaURBQTRFO0FBQzVFLG1FQUFrRTtBQUNsRSxtRkFBeUg7QUFDekgsNkRBQTZFO0FBQzdFLCtEQUFzRztBQUN0Ryw2Q0FBMEM7QUFFMUMsTUFBYSxXQUFZLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4QixNQUFNO1FBQ04sc0NBQXNDO1FBQ3RDLCtEQUErRDtRQUMvRCxxQkFBcUI7UUFDckIsTUFBTSxhQUFhLEdBQUcsSUFBSSxjQUFJLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUM5QyxTQUFTLEVBQUUsSUFBSSwwQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQztTQUNyRCxDQUFDLENBQUM7UUFFSCwyQ0FBMkM7UUFDM0MsYUFBYSxDQUFDLGdCQUFnQixDQUM1Qix1QkFBYSxDQUFDLHdCQUF3QixDQUFDLDhCQUE4QixDQUFDLENBQ3ZFLENBQUM7UUFFRixhQUFhLENBQUMsZ0JBQWdCLENBQzVCLHVCQUFhLENBQUMsd0JBQXdCLENBQUMsNENBQTRDLENBQUMsQ0FDckYsQ0FBQztRQUVGLE1BQU07UUFDTiwrQ0FBK0M7UUFDL0MsTUFBTSxHQUFHLEdBQUcsSUFBSSxhQUFHLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBQztZQUNuQyxtQkFBbUIsRUFBRTtnQkFDbkI7b0JBQ0UsUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLE9BQU87b0JBQ2IsVUFBVSxFQUFFLG9CQUFVLENBQUMsTUFBTTtpQkFDOUI7Z0JBQ0Q7b0JBQ0UsUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFB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QUFVLEVBQUUscUJBQXFCO1lBQ2pDLEtBQUssRUFBRSxZQUFZO1lBQ25CLGVBQWUsRUFBRSwyQkFBMkI7U0FDN0MsQ0FBQyxDQUFDO1FBRUgsV0FBVyxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTFDLG1EQUFtRDtRQUNuRCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsU0FBUyxDQUFDLGdCQUFnQjtTQUNsQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2S0Qsa0NBdUtDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbXBvcnQgeyBWcGMsIFN1Ym5ldFR5cGUsIFBlZXIsIFBvcnQsIEFtYXpvbkxpbnV4R2VuZXJhdGlvbiwgXG4gIEFtYXpvbkxpbnV4Q3B1VHlwZSwgSW5zdGFuY2UsIFNlY3VyaXR5R3JvdXAsIEFtYXpvbkxpbnV4SW1hZ2UsXG4gIEluc3RhbmNlQ2xhc3MsIEluc3RhbmNlU2l6ZSwgSW5zdGFuY2VUeXBlXG59IGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuXG5pbXBvcnQgeyBSb2xlLCBTZXJ2aWNlUHJpbmNpcGFsLCBNYW5hZ2VkUG9saWN5IH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgeyBQaXBlbGluZSwgQXJ0aWZhY3QgfSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lJztcbmltcG9ydCB7IEdpdEh1YlNvdXJjZUFjdGlvbiwgQ29kZUJ1aWxkQWN0aW9uLCBDb2RlRGVwbG95U2VydmVyRGVwbG95QWN0aW9uIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZS1hY3Rpb25zJztcbmltcG9ydCB7IFBpcGVsaW5lUHJvamVjdCwgTGludXhCdWlsZEltYWdlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVidWlsZCc7XG5pbXBvcnQgeyBTZXJ2ZXJEZXBsb3ltZW50R3JvdXAsIFNlcnZlckFwcGxpY2F0aW9uLCBJbnN0YW5jZVRhZ1NldCB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlZGVwbG95JztcbmltcG9ydCB7IFNlY3JldFZhbHVlIH0gZnJvbSAnYXdzLWNkay1saWInO1xuXG5leHBvcnQgY2xhc3MgRWMyQ2RrU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG4gICAgLy8gSUFNXG4gICAgLy8gUG9saWN5IGZvciBDb2RlRGVwbG95IGJ1Y2tldCBhY2Nlc3NcbiAgICAvLyBSb2xlIHRoYXQgd2lsbCBiZSBhdHRhY2hlZCB0byB0aGUgRUMyIGluc3RhbmNlIHNvIGl0IGNhbiBiZSBcbiAgICAvLyBtYW5hZ2VkIGJ5IEFXUyBTU01cbiAgICBjb25zdCB3ZWJTZXJ2ZXJSb2xlID0gbmV3IFJvbGUodGhpcywgXCJlYzJSb2xlXCIsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IFNlcnZpY2VQcmluY2lwYWwoXCJlYzIuYW1hem9uYXdzLmNvbVwiKSxcbiAgICB9KTtcblxuICAgIC8vIElBTSBwb2xpY3kgYXR0YWNobWVudCB0byBhbGxvdyBhY2Nlc3MgdG9cbiAgICB3ZWJTZXJ2ZXJSb2xlLmFkZE1hbmFnZWRQb2xpY3koXG4gICAgICBNYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcIkFtYXpvblNTTU1hbmFnZWRJbnN0YW5jZUNvcmVcIilcbiAgICApO1xuICAgIFxuICAgIHdlYlNlcnZlclJvbGUuYWRkTWFuYWdlZFBvbGljeShcbiAgICAgIE1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFwic2VydmljZS1yb2xlL0FtYXpvbkVDMlJvbGVmb3JBV1NDb2RlRGVwbG95XCIpXG4gICAgKTtcblxuICAgIC8vIFZQQ1xuICAgIC8vIFRoaXMgVlBDIGhhcyAzIHB1YmxpYyBzdWJuZXRzLCBhbmQgdGhhdCdzIGl0XG4gICAgY29uc3QgdnBjID0gbmV3IFZwYyh0aGlzLCAnbWFpbl92cGMnLHtcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAncHViMDEnLFxuICAgICAgICAgIHN1Ym5ldFR5cGU6IFN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgIG5hbWU6ICdwdWIwMicsXG4gICAgICAgICAgc3VibmV0VHlwZTogU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgbmFtZTogJ3B1YjAzJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBTdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgR3JvdXBzXG4gICAgLy8gVGhpcyBTRyB3aWxsIG9ubHkgYWxsb3cgSFRUUCB0cmFmZmljIHRvIHRoZSBXZWIgc2VydmVyXG4gICAgY29uc3Qgd2ViU2cgPSBuZXcgU2VjdXJpdHlHcm91cCh0aGlzLCAnd2ViX3NnJyx7XG4gICAgICB2cGMsXG4gICAgICBkZXNjcmlwdGlvbjogXCJBbGxvd3MgSW5ib3VuZCBIVFRQIHRyYWZmaWMgdG8gdGhlIHdlYiBzZXJ2ZXIuXCIsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuICAgIFxuICAgIHdlYlNnLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgUGVlci5hbnlJcHY0KCksXG4gICAgICBQb3J0LnRjcCg4MClcbiAgICApO1xuICAgIFxuICAgIC8vIEVDMiBJbnN0YW5jZVxuICAgIC8vIFRoaXMgaXMgdGhlIFB5dGhvbiBXZWIgc2VydmVyIHRoYXQgd2Ugd2lsbCBiZSB1c2luZ1xuICAgIC8vIEdldCB0aGUgbGF0ZXN0IEFtYXpvbkxpbnV4IDIgQU1JIGZvciB0aGUgZ2l2ZW4gcmVnaW9uXG4gICAgY29uc3QgYW1pID0gbmV3IEFtYXpvbkxpbnV4SW1hZ2Uoe1xuICAgICAgZ2VuZXJhdGlvbjogQW1hem9uTGludXhHZW5lcmF0aW9uLkFNQVpPTl9MSU5VWF8yMDIzLFxuICAgICAgY3B1VHlwZTogQW1hem9uTGludXhDcHVUeXBlLlg4Nl82NCxcbiAgICB9KTtcblxuICAgIC8vIFRoZSBhY3R1YWwgV2ViIEVDMiBJbnN0YW5jZSBmb3IgdGhlIHdlYiBzZXJ2ZXJcbiAgICBjb25zdCB3ZWJTZXJ2ZXIgPSBuZXcgSW5zdGFuY2UodGhpcywgJ3dlYl9zZXJ2ZXInLHtcbiAgICAgIHZwYyxcbiAgICAgIGluc3RhbmNlVHlwZTogSW5zdGFuY2VUeXBlLm9mKFxuICAgICAgICBJbnN0YW5jZUNsYXNzLlQzLFxuICAgICAgICBJbnN0YW5jZVNpemUuTUlDUk8sXG4gICAgICApLFxuICAgICAgbWFjaGluZUltYWdlOiBhbWksXG4gICAgICBzZWN1cml0eUdyb3VwOiB3ZWJTZyxcbiAgICAgIHJvbGU6IHdlYlNlcnZlclJvbGUsXG4gICAgfSk7XG5cbiAgICAvLyBVc2VyIGRhdGEgLSB1c2VkIGZvciBib290c3RyYXBwaW5nXG4gICAgY29uc3Qgd2ViU0dVc2VyRGF0YSA9IHJlYWRGaWxlU3luYygnLi9hc3NldHMvY29uZmlndXJlX2Ftel9saW51eF9zYW1wbGVfYXBwLnNoJywndXRmLTgnKTtcbiAgICB3ZWJTZXJ2ZXIuYWRkVXNlckRhdGEod2ViU0dVc2VyRGF0YSk7XG4gICAgLy8gVGFnIHRoZSBpbnN0YW5jZVxuICAgIGNkay5UYWdzLm9mKHdlYlNlcnZlcikuYWRkKCdhcHBsaWNhdGlvbi1uYW1lJywncHl0aG9uLXdlYicpXG4gICAgY2RrLlRhZ3Mub2Yod2ViU2VydmVyKS5hZGQoJ3N0YWdlJywncHJvZCcpXG4gICAgXG4gICAgLy8gUGlwZWxpbmUgc3R1ZmZcbiAgICAvLyBDb2RlUGlwZWxpbmVcbiAgICBjb25zdCBwaXBlbGluZSA9IG5ldyBQaXBlbGluZSh0aGlzLCAncHl0aG9uX3dlYl9waXBlbGluZScsIHtcbiAgICAgIHBpcGVsaW5lTmFtZTogJ3B5dGhvbi13ZWJBcHAnLFxuICAgICAgY3Jvc3NBY2NvdW50S2V5czogZmFsc2UsIC8vIHNvbHZlcyB0aGUgZW5jcnlwdGVkIGJ1Y2tldCBpc3N1ZVxuICAgIH0pO1xuXG4gICAgLy8gU1RBR0VTXG4gICAgLy8gU291cmNlIFN0YWdlXG4gICAgY29uc3Qgc291cmNlU3RhZ2UgPSBwaXBlbGluZS5hZGRTdGFnZSh7XG4gICAgICBzdGFnZU5hbWU6ICdTb3VyY2UnLFxuICAgIH0pO1xuICAgIFxuICAgIC8vIEJ1aWxkIFN0YWdlXG4gICAgY29uc3QgYnVpbGRTdGFnZSA9IHBpcGVsaW5lLmFkZFN0YWdlKHtcbiAgICAgIHN0YWdlTmFtZTogJ0J1aWxkJyxcbiAgICB9KTtcbiAgICBcbiAgICAvLyBEZXBsb3kgU3RhZ2VcbiAgICBjb25zdCBkZXBsb3lTdGFnZSA9IHBpcGVsaW5lLmFkZFN0YWdlKHtcbiAgICAgIHN0YWdlTmFtZTogJ0RlcGxveScsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgc29tZSBhY3Rpb25cbiAgICAvLyBTb3VyY2UgYWN0aW9uXG4gICAgY29uc3Qgc291cmNlT3V0cHV0ID0gbmV3IEFydGlmYWN0KCk7XG4gICAgY29uc3QgZ2l0aHViU291cmNlQWN0aW9uID0gbmV3IEdpdEh1YlNvdXJjZUFjdGlvbih7XG4gICAgICBhY3Rpb25OYW1lOiAnR2l0aHViU291cmNlJyxcbiAgICAgIG9hdXRoVG9rZW46IFNlY3JldFZhbHVlLnNlY3JldHNNYW5hZ2VyKCdnaXRodWItb2F1dGgtdG9rZW4nKSwgLy8gU0VUIFVQIEJFRk9SRVxuICAgICAgb3duZXI6ICdBYWthcnNoYWstVE5NJywgLy8gVEhJUyBORUVEUyBUTyBCRSBDSEFOR0VEIFRPIFRIRSBSRUFERVJcbiAgICAgIHJlcG86ICdzYW1wbGUtcHl0aG9uLXdlYi1hcHAnLFxuICAgICAgYnJhbmNoOiAnbWFpbicsXG4gICAgICBvdXRwdXQ6IHNvdXJjZU91dHB1dCxcbiAgICB9KTtcblxuICAgIHNvdXJjZVN0YWdlLmFkZEFjdGlvbihnaXRodWJTb3VyY2VBY3Rpb24pO1xuXG4gICAgLy8gQnVpbGQgQWN0aW9uXG4gICAgY29uc3QgcHl0aG9uVGVzdFByb2plY3QgPSBuZXcgUGlwZWxpbmVQcm9qZWN0KHRoaXMsICdweXRob25UZXN0UHJvamVjdCcsIHtcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIGJ1aWxkSW1hZ2U6IExpbnV4QnVpbGRJbWFnZS5BTUFaT05fTElOVVhfMl81XG4gICAgICB9XG4gICAgfSk7XG4gICAgXG4gICAgY29uc3QgcHl0aG9uVGVzdE91dHB1dCA9IG5ldyBBcnRpZmFjdCgpO1xuICAgIGNvbnN0IHB5dGhvblRlc3RBY3Rpb24gPSBuZXcgQ29kZUJ1aWxkQWN0aW9uKHtcbiAgICAgIGFjdGlvbk5hbWU6ICdUZXN0UHl0aG9uJyxcbiAgICAgIHByb2plY3Q6IHB5dGhvblRlc3RQcm9qZWN0LFxuICAgICAgaW5wdXQ6IHNvdXJjZU91dHB1dCxcbiAgICAgIG91dHB1dHM6IFtweXRob25UZXN0T3V0cHV0XVxuICAgIH0pO1xuXG4gICAgYnVpbGRTdGFnZS5hZGRBY3Rpb24ocHl0aG9uVGVzdEFjdGlvbik7XG5cbiAgICAvLyBEZXBsb3kgQWN0aW9uc1xuICAgIGNvbnN0IHB5dGhvbkRlcGxveUFwcGxpY2F0aW9uID0gbmV3IFNlcnZlckFwcGxpY2F0aW9uKHRoaXMsXCJweXRob25fZGVwbG95X2FwcGxpY2F0aW9uXCIsIHtcbiAgICAgIGFwcGxpY2F0aW9uTmFtZTogJ3B5dGhvbi13ZWJBcHAnXG4gICAgfSk7XG5cbiAgICAvLyBEZXBsb3ltZW50IGdyb3VwXG4gICAgY29uc3QgcHl0aG9uU2VydmVyRGVwbG95bWVudEdyb3VwID0gbmV3IFNlcnZlckRlcGxveW1lbnRHcm91cCh0aGlzLCdQeXRob25BcHBEZXBsb3lHcm91cCcsIHtcbiAgICAgIGFwcGxpY2F0aW9uOiBweXRob25EZXBsb3lBcHBsaWNhdGlvbixcbiAgICAgIGRlcGxveW1lbnRHcm91cE5hbWU6ICdQeXRob25BcHBEZXBsb3ltZW50R3JvdXAnLFxuICAgICAgaW5zdGFsbEFnZW50OiB0cnVlLFxuICAgICAgZWMySW5zdGFuY2VUYWdzOiBuZXcgSW5zdGFuY2VUYWdTZXQoXG4gICAgICB7XG4gICAgICAgICdhcHBsaWNhdGlvbi1uYW1lJzogWydweXRob24td2ViJ10sXG4gICAgICAgICdzdGFnZSc6Wydwcm9kJywgJ3N0YWdlJ11cbiAgICAgIH0pXG4gICAgfSk7XG5cbiAgICAvLyBEZXBsb3ltZW50IGFjdGlvblxuICAgIGNvbnN0IHB5dGhvbkRlcGxveUFjdGlvbiA9IG5ldyBDb2RlRGVwbG95U2VydmVyRGVwbG95QWN0aW9uKHtcbiAgICAgIGFjdGlvbk5hbWU6ICdQeXRob25BcHBEZXBsb3ltZW50JyxcbiAgICAgIGlucHV0OiBzb3VyY2VPdXRwdXQsXG4gICAgICBkZXBsb3ltZW50R3JvdXA6IHB5dGhvblNlcnZlckRlcGxveW1lbnRHcm91cCxcbiAgICB9KTtcblxuICAgIGRlcGxveVN0YWdlLmFkZEFjdGlvbihweXRob25EZXBsb3lBY3Rpb24pO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBwdWJsaWMgSVAgYWRkcmVzcyBvZiB0aGUgRUMyIGluc3RhbmNlXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJJUCBBZGRyZXNzXCIsIHtcbiAgICAgIHZhbHVlOiB3ZWJTZXJ2ZXIuaW5zdGFuY2VQdWJsaWNJcCxcbiAgICB9KTtcbiAgfVxufVxuIl19