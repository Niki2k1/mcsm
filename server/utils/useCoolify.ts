export const useCoolify = () => {
  const config = useRuntimeConfig();

  const coolifyFetch = $fetch.create({
    baseURL: `${config.coolify.instances.default.baseUrl}/api/v1`,
    headers: {
      Authorization: `Bearer ${config.coolify.instances.default.apiToken}`,
    },
  });

  async function createApplication(config: {
    project_uuid: string;
    server_uuid: string;
    environment_name: string;
    docker_registry_image_name: string;
    docker_registry_image_tag?: string;
    ports_exposes: string;
    destination_uuid?: string;
    name?: string;
    description?: string;
    domains?: string;
    ports_mappings?: string;
    health_check_enabled?: boolean;
    health_check_path?: string;
    health_check_port?: string;
    health_check_host?: string;
    health_check_method?: string;
    health_check_return_code?: number;
    health_check_scheme?: string;
    health_check_response_text?: string;
    health_check_interval?: number;
    health_check_timeout?: number;
    health_check_retries?: number;
    health_check_start_period?: number;
    limits_memory?: string;
    limits_memory_swap?: string;
    limits_memory_swappiness?: number;
    limits_memory_reservation?: string;
    limits_cpus?: string;
    limits_cpuset?: string;
    limits_cpu_shares?: number;
    custom_labels?: string;
    custom_docker_run_options?: string;
    post_deployment_command?: string;
    post_deployment_command_container?: string;
    pre_deployment_command?: string;
    pre_deployment_command_container?: string;
    manual_webhook_secret_github?: string;
    manual_webhook_secret_gitlab?: string;
    manual_webhook_secret_bitbucket?: string;
    manual_webhook_secret_gitea?: string;
    redirect?: string;
    instant_deploy?: boolean;
  }) {
    return coolifyFetch<{ uuid: string; domains: null }>(
      "/applications/dockerimage",
      {
        method: "POST",
        body: config,
      }
    );
  }

  async function createEnv(
    uuid: string,
    config: {
      key: string;
      value: string;
      is_preview?: boolean;
      is_build_time?: boolean;
      is_literal?: boolean;
    }
  ) {
    return coolifyFetch<{ uuid: string; domains: null }>(
      `/applications/${uuid}/envs`,
      {
        method: "POST",
        body: {
          is_preview: false,
          is_build_time: false,
          is_literal: false,
          ...config,
        },
      }
    );
  }

  async function start(uuid: string) {
    return coolifyFetch(`/applications/${uuid}/start`);
  }

  return {
    createApplication,
    createEnv,
    start,
  };
};
